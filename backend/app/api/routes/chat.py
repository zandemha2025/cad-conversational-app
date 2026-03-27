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
from app.data.standard_components import STANDARD_COMPONENTS
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

            # Fetch conversation history BEFORE saving current message,
            # so stream_chat doesn't see a duplicate user turn at the end.
            history_res = (
                sb.table("conversation_messages")
                .select("role,content")
                .eq("project_id", project_id)
                .order("created_at", desc=True)
                .limit(20)
                .execute()
            )
            history = list(reversed(history_res.data or []))

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

            # Fetch project context
            proj_res = sb.table("projects").select("*").eq("id", project_id).single().execute()
            project_ctx = proj_res.data or {}

            # Classify intent (quick Flash call, non-streaming)
            intent = await gemini.classify_intent(content, project_ctx)
            log.info("project=%s intent=%s", project_id, intent)

            # Notify client we're responding
            await websocket.send_json({"type": "thinking", "intent": intent})

            # If fixture generation or AI modification is requested → queue Celery job
            if intent in ("fixture_generation", "geometry_modification", "kcl_revision"):
                from app.tasks.generate_fixture import generate_fixture_task

                task_prompt = content

                # For modification intents, fetch previous KCL for iterative editing
                if intent in ("geometry_modification", "kcl_revision"):
                    fixture_res = (
                        sb.table("fixture_geometries")
                        .select("kcl,version")
                        .eq("project_id", project_id)
                        .order("generated_at", desc=True)
                        .limit(1)
                        .execute()
                    )
                    if fixture_res.data and fixture_res.data[0].get("kcl"):
                        prev_kcl = fixture_res.data[0]["kcl"]
                        prev_ver = fixture_res.data[0].get("version", 1)
                        task_prompt = (
                            f"MODIFICATION REQUEST: {content}\n\n"
                            f"PREVIOUS FIXTURE (v{prev_ver}) KCL CODE TO MODIFY:\n"
                            f"```kcl\n{prev_kcl}\n```\n\n"
                            f"Apply the modification request to the KCL code above. "
                            f"Preserve all existing features not mentioned in the modification."
                        )

                job = generate_fixture_task.apply_async(
                    args=[project_id, task_prompt],
                    queue="normal",
                )
                await websocket.send_json({
                    "type": "generation_queued",
                    "job_id": job.id,
                    "message": "Generating your fixture — this takes about 15 seconds.",
                })
                # Still stream a brief explanation
                explanation_prompt = (
                    f"The engineer requested: {content!r}. "
                    "Briefly confirm what you're generating and what to expect."
                )
                full_response = ""
                async for chunk in gemini.stream_chat(explanation_prompt, history, project_ctx):
                    full_response += chunk
                    await websocket.send_json({"type": "chunk", "content": chunk})
                await websocket.send_json({"type": "done", "intent": intent, "job_id": job.id})

                # Suggest standard components for this fixture design
                try:
                    catalog_hints = [
                        f"{c['id']}: {c.get('prompt_hint', c['name'])}"
                        for c in STANDARD_COMPONENTS
                    ]
                    suggestions = await gemini.suggest_components(content, catalog_hints)
                    if suggestions:
                        await websocket.send_json({
                            "type": "component_suggestions",
                            "suggestions": suggestions,
                        })
                except Exception as sugg_err:
                    log.warning("suggest_components failed: %s", sugg_err)
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
