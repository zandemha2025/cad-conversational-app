"""
WebSocket chat endpoint — streams Gemini Flash responses and runs
fixture generation inline (no Celery/Redis dependency).

WS URL: /api/projects/{project_id}/chat
Auth:   Send token in first message: { "type": "auth", "token": "<jwt>" }
Then:   { "type": "message", "content": "...", "attachments": [] }
Server: streams back { "type": "chunk", "content": "..." }
        then          { "type": "done", "intent": "...", "job_id": null|"..." }
        or            { "type": "error", "detail": "..." }
"""
import asyncio
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.security import verify_supabase_jwt, verify_token
from app.core.database import get_supabase_client
from app.services.gemini_service import GeminiService
from app.services.validation_engine import run_all as validate_all
from app.data.standard_components import STANDARD_COMPONENTS
import uuid
from datetime import datetime, timezone

router = APIRouter(tags=["chat"])
log = logging.getLogger(__name__)
gemini = GeminiService()


# ── Inline generation pipeline (replaces Celery task) ─────────────────────────

async def _ws_send_safe(ws: WebSocket, data: dict):
    """Send JSON over WebSocket, swallowing errors if client disconnected."""
    try:
        await ws.send_json(data)
    except Exception:
        pass


async def _run_generation_inline(
    ws: WebSocket,
    project_id: str,
    user_prompt: str,
    sb,
):
    """
    Run the full fixture generation pipeline inline, sending progress
    updates directly over the WebSocket. No Celery/Redis needed.
    """
    job_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # ── 1. Fetch context ──────────────────────────────────────────────────
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.05,
            "message": "Assembling context…", "job_id": job_id,
        })

        proj = sb.table("projects").select("*").eq("id", project_id).single().execute().data or {}
        env = proj.get("environment_json") or {}
        printer = proj.get("printer_profile_json") or {}
        template_id = proj.get("template_id") or "generic_fixture"

        geom_res = (
            sb.table("part_geometries")
            .select("features_json")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        features = {}
        if geom_res.data:
            features = geom_res.data[0].get("features_json") or {}

        tp_res = sb.table("touchpoints").select("*").eq("project_id", project_id).execute()
        touchpoints = tp_res.data or []

        prompt_text = (user_prompt or "").strip() or f"Generate a {template_id.replace('_', ' ')} fixture"

        # ── 2. AI decomposition ───────────────────────────────────────────────
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.10,
            "message": "Analyzing design complexity…", "job_id": job_id,
        })

        decomposition = await gemini.decompose_prompt(prompt_text)
        is_assembly = decomposition.get("type") == "assembly"
        components = decomposition.get("components", [])

        if not is_assembly:
            prompt_text = decomposition.get("prompt", prompt_text)

        # ── 3. Generate KCL ──────────────────────────────────────────────────
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.25,
            "message": "Generating parametric model…", "job_id": job_id,
        })

        kcl = await gemini.generate_kcl(
            part_features=features,
            touchpoints=touchpoints,
            environment=env,
            printer_profile=printer,
            template_id=template_id,
            user_prompt=prompt_text,
        )

        # ── 4. Generate 3D geometry ──────────────────────────────────────────
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.40,
            "message": "Generating 3D geometry via Zoo.dev…", "job_id": job_id,
        })

        # Determine next version
        ver_res = (
            sb.table("fixture_geometries")
            .select("version")
            .eq("project_id", project_id)
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        version = (ver_res.data[0]["version"] + 1) if ver_res.data else 1
        fixture_id = str(uuid.uuid4())

        # Pre-insert fixture record
        sb.table("fixture_geometries").insert({
            "id": fixture_id,
            "project_id": project_id,
            "version": version,
            "kcl": kcl,
            "gltf_url": None,
            "generation_prompt": user_prompt,
            "generated_at": now_iso,
        }).execute()

        generation_errors: list[str] = []

        from app.services.zoo_service import text_to_cad_gltf
        result = await text_to_cad_gltf(project_id, prompt_text, version)
        gltf_url = result.get("gltf_url")
        zoo_kcl = result.get("kcl")
        is_stub = bool(gltf_url and "_stub_" in str(gltf_url))

        if result.get("error"):
            generation_errors.append(result["error"])

        stored_kcl = zoo_kcl or kcl

        # Update fixture with final URLs
        sb.table("fixture_geometries").update({
            "gltf_url": gltf_url,
            "kcl": stored_kcl,
        }).eq("id", fixture_id).execute()

        # ── 5. Node graph ────────────────────────────────────────────────────
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.80,
            "message": "Building parametric node graph…", "job_id": job_id,
        })

        try:
            node_graph = await gemini.generate_node_graph(
                part_features=features,
                touchpoints=touchpoints,
                environment=env,
                printer_profile=printer,
                template_id=template_id,
            )
            sb.table("node_graphs").insert({
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "nodes_json": node_graph.get("nodes", []),
                "connections_json": node_graph.get("connections", []),
                "generated_at": now_iso,
            }).execute()
        except Exception as ng_exc:
            log.error("Node graph generation failed project=%s: %s", project_id, ng_exc)

        # ── 6. DFM validation ────────────────────────────────────────────────
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.90,
            "message": "Running DFM validation…", "job_id": job_id,
        })

        try:
            all_results = validate_all(
                features=features,
                printer_profile=printer,
                touchpoints=touchpoints,
                project=proj,
            )
            for method, issues in all_results.items():
                errors = sum(1 for i in issues if i["severity"] == "error")
                warnings = sum(1 for i in issues if i["severity"] == "warning")
                sb.table("validation_results").insert({
                    "id": str(uuid.uuid4()),
                    "project_id": project_id,
                    "method": method,
                    "issues_json": issues,
                    "error_count": errors,
                    "warning_count": warnings,
                    "ran_at": now_iso,
                }).execute()
        except Exception as val_exc:
            log.error("Validation failed project=%s: %s", project_id, val_exc)

        # ── 7. Done ──────────────────────────────────────────────────────────
        if not gltf_url:
            await _ws_send_safe(ws, {
                "type": "generation_error", "job_id": job_id,
                "message": "Generation failed — no 3D model could be produced. Try a simpler request.",
                "fixture_id": fixture_id,
            })
            sb.table("conversation_messages").insert({
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "role": "system",
                "content": "⚠️ Fixture generation failed. Try simplifying your request or adding specific dimensions.",
                "attachments": [], "linked_node_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        else:
            done_msg = "Fixture ready!" if not is_stub else (
                "⚠️ Placeholder model created — try adding specific dimensions for better results."
            )
            if generation_errors:
                done_msg += f" (warnings: {'; '.join(generation_errors)})"
            await _ws_send_safe(ws, {
                "type": "generation_done", "job_id": job_id,
                "message": done_msg,
                "progress": 1.0,
                "fixture_id": fixture_id,
                "gltf_url": gltf_url,
                "is_stub": is_stub,
            })

        log.info("inline generation done project=%s fixture=%s gltf=%s errors=%s",
                 project_id, fixture_id, bool(gltf_url), generation_errors or "none")

    except Exception as exc:
        log.exception("Inline generation FAILED project=%s: %s", project_id, exc)
        await _ws_send_safe(ws, {
            "type": "generation_error", "job_id": job_id,
            "message": f"Generation failed: {str(exc)[:200]}",
        })
        try:
            sb.table("conversation_messages").insert({
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "role": "system",
                "content": f"⚠️ Fixture generation failed: {str(exc)[:300]}. Please try again.",
                "attachments": [], "linked_node_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception:
            pass


# ── WebSocket endpoint ────────────────────────────────────────────────────────

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

            # Fetch conversation history BEFORE saving current message
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

            # Classify intent
            intent = await gemini.classify_intent(content, project_ctx)
            log.info("project=%s intent=%s", project_id, intent)

            await websocket.send_json({"type": "thinking", "intent": intent})

            # ── Generation intents → run inline (no Celery) ───────────────────
            if intent in ("fixture_generation", "geometry_modification", "kcl_revision"):
                task_prompt = content

                # For modifications, include previous KCL
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

                # Tell client generation is starting
                gen_job_id = str(uuid.uuid4())
                await websocket.send_json({
                    "type": "generation_queued",
                    "job_id": gen_job_id,
                    "message": "Generating your fixture — this takes about 15 seconds.",
                })

                # Stream brief AI explanation while generation runs in background
                explanation_prompt = (
                    f"The engineer requested: {content!r}. "
                    "Briefly confirm what you're generating. "
                    "Keep it concise — 2-3 sentences max."
                )
                full_response = ""
                async for chunk in gemini.stream_chat(explanation_prompt, history, project_ctx):
                    full_response += chunk
                    await websocket.send_json({"type": "chunk", "content": chunk})
                await websocket.send_json({"type": "done", "intent": intent, "job_id": gen_job_id})

                # Launch generation inline (runs in the same event loop)
                asyncio.create_task(
                    _run_generation_inline(websocket, project_id, task_prompt, sb)
                )

                # Suggest standard components
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
                # Pure conversational response
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
