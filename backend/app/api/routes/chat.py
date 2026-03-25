"""
WebSocket chat endpoint — streams Gemini Flash responses.

WS URL: /api/projects/{project_id}/chat
Auth:   Send token in first message: { "type": "auth", "token": "<jwt>" }
Then:   { "type": "message", "content": "...", "attachments": [] }
Server: streams back { "type": "chunk", "content": "..." }
        then          { "type": "done", "intent": "...", "job_id": null|"..." }
        or            { "type": "error", "detail": "..." }
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.security import verify_supabase_jwt, verify_token
from app.core.database import get_supabase_client
from app.services.gemini_service import GeminiService
import uuid
from datetime import datetime, timezone

router = APIRouter(tags=["chat"])
log = logging.getLogger(__name__)
gemini = GeminiService()


@router.websocket("/projects/{project_id}/chat")
async def chat_ws(websocket: WebSocket, project_id: str):
    await websocket.accept()
    user_id: str | None = None

    try:
        # ── Auth handshake ─────────────────────────────────────────────────────
        raw = await websocket.receive_text()
        msg = json.loads(raw)

        if msg.get("type") != "auth":
            await websocket.send_json({"type": "error", "detail": "Send auth message first"})
            await websocket.close(code=1008)
            return

        token = msg.get("token", "")
        payload = verify_supabase_jwt(token) or verify_token(token)
        if not payload:
            await websocket.send_json({"type": "error", "detail": "Invalid token"})
            await websocket.close(code=1008)
            return

        user_id = payload.get("sub")
        await websocket.send_json({"type": "auth_ok"})

        # ── Message loop ───────────────────────────────────────────────────────
        sb = get_supabase_client()

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") != "message":
                continue

            content  = msg.get("content", "").strip()
            node_ref = msg.get("linked_node_id")
            if not content:
                continue

            # Save user message
            msg_id = str(uuid.uuid4())
            sb.table("conversation_messages").insert({
                "id": msg_id,
                "project_id": project_id,
                "role": "user",
                "content": content,
                "attachments": msg.get("attachments", []),
                "linked_node_id": node_ref,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()

            # Fetch conversation history (last 20 messages)
            history_res = (
                sb.table("conversation_messages")
                .select("role,content")
                .eq("project_id", project_id)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
            )
            history = list(reversed(history_res.data or []))

            # Fetch project context
            proj_res = sb.table("projects").select("*").eq("id", project_id).single().execute()
            project_ctx = proj_res.data or {}

            # Classify intent (quick Flash call, non-streaming)
            intent = await gemini.classify_intent(content, project_ctx)
            log.info("project=%s intent=%s", project_id, intent)

            # Notify client we're responding
            await websocket.send_json({"type": "thinking", "intent": intent})

            # ── Fixture generation / modification → queue Celery job ──────────
            if intent in ("fixture_generation", "fixture_modification"):
                from app.tasks.generate_fixture import generate_fixture_task

                previous_description: str | None = None
                combined_prompt = content

                if intent == "fixture_modification":
                    # Fetch the latest fixture geometry to get its design context
                    try:
                        fg_res = (
                            sb.table("fixture_geometries")
                            .select("version,generation_prompt,design_description")
                            .eq("project_id", project_id)
                            .order("version", desc=True)
                            .limit(1)
                            .execute()
                        )
                        if fg_res.data:
                            row = fg_res.data[0]
                            # Prefer design_description (AI summary); fall back to generation_prompt
                            previous_description = (
                                row.get("design_description") or row.get("generation_prompt")
                            )
                    except Exception as e:
                        log.warning("Could not fetch previous fixture context: %s", e)

                job = generate_fixture_task.apply_async(
                    args=[project_id, combined_prompt],
                    kwargs={"previous_description": previous_description},
                    queue="normal",
                )

                queue_msg = (
                    "Updating your fixture — this takes about 15 seconds."
                    if intent == "fixture_modification"
                    else "Generating your fixture — this takes about 15 seconds."
                )
                await websocket.send_json({
                    "type": "generation_queued",
                    "job_id": job.id,
                    "message": queue_msg,
                })

                # Stream a brief explanation acknowledging what's changing
                if intent == "fixture_modification" and previous_description:
                    explanation_prompt = (
                        f"The engineer wants to modify an existing fixture. "
                        f"Current design: {previous_description[:300]}. "
                        f"Requested change: {content!r}. "
                        "In 1–2 sentences, confirm what you're changing and what to expect. "
                        "Be specific about the modification (e.g. 'I'll increase the base plate "
                        "thickness to 8mm and regenerate the model...')."
                    )
                else:
                    explanation_prompt = (
                        f"The engineer requested: {content!r}. "
                        "Briefly confirm what you're generating and what to expect."
                    )

                full_response = ""
                async for chunk in gemini.stream_chat(explanation_prompt, history, project_ctx):
                    full_response += chunk
                    await websocket.send_json({"type": "chunk", "content": chunk})
                await websocket.send_json({"type": "done", "intent": intent, "job_id": job.id})
            else:
                # Pure conversational response — stream directly
                full_response = ""
                async for chunk in gemini.stream_chat(content, history, project_ctx):
                    full_response += chunk
                    await websocket.send_json({"type": "chunk", "content": chunk})
                await websocket.send_json({"type": "done", "intent": intent, "job_id": None})

            # Save assistant reply
            sb.table("conversation_messages").insert({
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "role": "assistant",
                "content": full_response,
                "attachments": [],
                "linked_node_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()

    except WebSocketDisconnect:
        log.info("WS disconnected project=%s user=%s", project_id, user_id)
    except Exception as exc:
        log.exception("WS error project=%s: %s", project_id, exc)
        try:
            await websocket.send_json({"type": "error", "detail": "Internal server error"})
        except Exception:
            pass
