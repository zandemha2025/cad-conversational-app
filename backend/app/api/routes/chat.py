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


class _SkipSinglePart(Exception):
    """Sentinel exception to skip single-part generation when assembly already produced geometry."""
    pass
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

# Keeps strong references to background generation tasks so asyncio GC doesn't
# cancel them while they're still running.
_background_tasks: set = set()


# ── Inline generation pipeline (replaces Celery task) ─────────────────────────

async def _ws_send_safe(ws: WebSocket, data: dict):
    """Send JSON over WebSocket, swallowing errors if client disconnected."""
    try:
        await ws.send_json(data)
    except Exception:
        pass


class _ProgressHeartbeat:
    """Sends incremental progress updates on a timer during long-running steps.

    Usage:
        async with _ProgressHeartbeat(ws, job_id, start=0.25, end=0.40, message="Generating..."):
            await some_long_task()
    The progress bar will tick from `start` toward `end` every `interval` seconds
    so users see movement instead of a frozen bar.
    """

    def __init__(self, ws: WebSocket, job_id: str, *, start: float, end: float,
                 message: str, interval: float = 8.0):
        self.ws = ws
        self.job_id = job_id
        self.start = start
        self.end = end
        self.message = message
        self.interval = interval
        self._task: asyncio.Task | None = None

    async def _tick(self):
        # Move roughly 40% of remaining distance each tick so it asymptotically
        # approaches `end` but never reaches it (the real step sends the exact value).
        progress = self.start
        try:
            while True:
                await asyncio.sleep(self.interval)
                remaining = self.end - progress
                progress += remaining * 0.4
                progress = min(progress, self.end - 0.01)  # never hit the target
                await _ws_send_safe(self.ws, {
                    "type": "generation_progress",
                    "progress": round(progress, 2),
                    "message": self.message,
                    "job_id": self.job_id,
                })
        except asyncio.CancelledError:
            pass

    async def __aenter__(self):
        self._task = asyncio.create_task(self._tick())
        return self

    async def __aexit__(self, *exc):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass


async def _run_generation_inline(
    ws: WebSocket,
    project_id: str,
    user_prompt: str,
    sb,
    job_id: str | None = None,
):
    """
    Run the full fixture generation pipeline inline, sending progress
    updates directly over the WebSocket. No Celery/Redis needed.
    """
    job_id = job_id or str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    try:
        # ── 1. Fetch context ──────────────────────────────────────────────────
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.05,
            "message": "Assembling context…", "job_id": job_id,
        })

        try:
            proj = sb.table("projects").select("*").eq("id", project_id).single().execute().data or {}
        except Exception as e:
            log.warning("Could not fetch project %s: %s — using empty context", project_id, e)
            proj = {}
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

        try:
            decomposition = await gemini.decompose_prompt(prompt_text)
        except Exception as decomp_exc:
            log.warning("decompose_prompt failed project=%s: %s — using prompt as-is", project_id, decomp_exc)
            decomposition = {"type": "single", "prompt": prompt_text, "components": []}
        is_assembly = decomposition.get("type") == "assembly"
        components = decomposition.get("components", [])

        # Keep prompt_text as the user's original input — do not replace with
        # decomposition's "enhanced" version, which can add assumed features.

        # ── 3. Determine version and pre-insert fixture record ───────────────
        # Pre-insert with gltf_url=None so GET /geometry/fixture always finds
        # a row even if generation fails partway through.
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

        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.25,
            "message": "Generating parametric model…", "job_id": job_id,
        })

        try:
            async with _ProgressHeartbeat(ws, job_id, start=0.25, end=0.40,
                                          message="Generating parametric model…"):
                kcl = await gemini.generate_kcl(
                    part_features=features,
                    touchpoints=touchpoints,
                    environment=env,
                    printer_profile=printer,
                    template_id=template_id,
                    user_prompt=prompt_text,
                )
        except Exception as kcl_exc:
            log.warning("generate_kcl failed project=%s: %s — using empty KCL", project_id, kcl_exc)
            kcl = ""

        # Use upsert to handle race conditions where a previous failed attempt
        # left a row with the same (project_id, version).
        result = sb.table("fixture_geometries").upsert({
            "id": fixture_id,
            "project_id": project_id,
            "version": version,
            "kcl": kcl,
            "gltf_url": None,
            "generation_prompt": user_prompt,
            "generated_at": now_iso,
        }, on_conflict="project_id,version").execute()
        if hasattr(result, 'error') and result.error:
            log.error("Failed to upsert fixture_geometries: %s", result.error)
            raise Exception(f"DB upsert failed: {result.error}")
        # Use the actual ID from the upsert result (may be existing row's ID)
        if result.data and len(result.data) > 0:
            fixture_id = result.data[0].get("id", fixture_id)

        # ── 4. Generate 3D geometry ──────────────────────────────────────────
        # PRIMARY: CadQuery (Open CASCADE) for precise parametric fixtures
        # FALLBACK: Zoo.dev text-to-cad AI
        await _ws_send_safe(ws, {
            "type": "generation_progress", "progress": 0.40,
            "message": "Generating precise fixture geometry via CadQuery…", "job_id": job_id,
        })

        generation_errors: list[str] = []
        gltf_url = None
        zoo_kcl = None
        is_stub = False

        from app.services.cadquery_service import execute_cadquery_script

        # ── Assembly path: generate components in parallel ────────────────────
        if is_assembly and len(components) >= 2:
            log.info("Assembly detected: %d components project=%s", len(components), project_id)
            await _ws_send_safe(ws, {
                "type": "generation_progress", "progress": 0.30,
                "message": f"Generating {len(components)}-part assembly…", "job_id": job_id,
            })

            loop = asyncio.get_event_loop()
            sem = asyncio.Semaphore(2)  # Limit concurrent CadQuery subprocesses (2GB RAM)
            assembly_records = []
            primary_gltf = None

            async def _gen_one_component(comp: dict, idx: int) -> dict:
                async with sem:
                    comp_name = comp.get("name", f"component_{idx}")
                    comp_prompt = comp.get("prompt", comp.get("description", ""))
                    comp_engine = comp.get("engine", "cadquery")

                    await _ws_send_safe(ws, {
                        "type": "generation_progress",
                        "progress": 0.30 + 0.50 * idx / len(components),
                        "message": f"Generating {comp_name} ({idx+1}/{len(components)})…",
                        "job_id": job_id,
                    })

                    if comp_engine == "cadquery":
                        try:
                            cq_code = await gemini.generate_cadquery_fixture(
                                part_features={}, touchpoints=[], environment={},
                                printer_profile={}, template_id="generic",
                                user_prompt=comp_prompt,
                            )
                            result = await loop.run_in_executor(
                                None,
                                lambda s=cq_code: execute_cadquery_script(s, project_id, comp_name, version)
                            )
                            return {"name": comp_name, "gltf_url": result.get("gltf_url"),
                                    "component_type": comp.get("component_type", "custom"),
                                    "description": comp.get("description", "")}
                        except Exception as e:
                            log.warning("Assembly component %s failed: %s", comp_name, e)
                            return {"name": comp_name, "gltf_url": None,
                                    "component_type": comp.get("component_type", "custom"),
                                    "description": comp.get("description", "")}
                    else:
                        try:
                            from app.services.zoo_service import text_to_cad_gltf
                            result = await text_to_cad_gltf(project_id, comp_prompt, version)
                            return {"name": comp_name, "gltf_url": result.get("gltf_url"),
                                    "component_type": comp.get("component_type", "custom"),
                                    "description": comp.get("description", "")}
                        except Exception as e:
                            log.warning("Assembly component %s (zoo) failed: %s", comp_name, e)
                            return {"name": comp_name, "gltf_url": None,
                                    "component_type": comp.get("component_type", "custom"),
                                    "description": comp.get("description", "")}

            # Generate all components in parallel
            tasks = [_gen_one_component(c, i) for i, c in enumerate(components)]
            results = await asyncio.gather(*tasks, return_exceptions=True)

            for r in results:
                if isinstance(r, Exception):
                    generation_errors.append(str(r)[:200])
                    continue
                assembly_records.append(r)
                if r.get("gltf_url") and not primary_gltf:
                    primary_gltf = r["gltf_url"]

            # Store assembly components in DB
            for rec in assembly_records:
                try:
                    sb.table("assembly_components").insert({
                        "id": str(uuid.uuid4()),
                        "fixture_id": fixture_id,
                        "project_id": project_id,
                        "name": rec["name"],
                        "component_type": rec.get("component_type", "custom"),
                        "description": rec.get("description", ""),
                        "gltf_url": rec.get("gltf_url"),
                        "position_json": None,
                        "rotation_json": None,
                        "material": "6061-T6 aluminum",
                        "created_at": now_iso,
                    }).execute()
                except Exception as db_exc:
                    log.warning("Failed to insert assembly_component %s: %s", rec["name"], db_exc)

            gltf_url = primary_gltf
            log.info("Assembly generation done: %d components, %d with geometry project=%s",
                     len(assembly_records), sum(1 for r in assembly_records if r.get("gltf_url")), project_id)

        # ── Single-part path (skip if assembly already produced geometry) ─────
        MAX_CQ_ATTEMPTS = 2
        _cq_dimensions = None
        _cq_script_final = None  # Store the final CadQuery script for DB

        if gltf_url:
            # Assembly already produced geometry — skip single-part generation
            log.info("Skipping single-part path (assembly produced gltf) project=%s", project_id)
        if not gltf_url:
            pass
        try:
            if gltf_url:
                # Assembly already produced geometry — skip single-part generation
                raise _SkipSinglePart()

            # ── Detect high-detail prompts ────────────────────────────────
            # If the prompt contains specific dimensions (Ø, mm, diameter, radius),
            # multiple numeric values, and engineering terms — it's already precise.
            # Skip research/spec/clarification layers that LOSE detail, go straight
            # to CadQuery generation with the FULL user prompt as primary context.
            import re
            _numeric_dims = len(re.findall(r'\d+(?:\.\d+)?\s*mm|\bØ\d|\bdia(?:meter)?\b|\bradius\b', prompt_text.lower()))
            _is_high_detail = _numeric_dims >= 4  # 4+ specific dimensions = precise prompt

            design_spec = {}
            research_data = {}

            if _is_high_detail:
                log.info("HIGH-DETAIL prompt detected (%d dimensions) — skipping research/spec layers project=%s",
                         _numeric_dims, project_id)
                await _ws_send_safe(ws, {
                    "type": "generation_progress", "progress": 0.30,
                    "message": "Detailed spec detected — generating directly…", "job_id": job_id,
                })
            else:
                # Standard path: Research → Spec for vague/moderate prompts
                await _ws_send_safe(ws, {
                    "type": "generation_progress", "progress": 0.25,
                    "message": "Researching specifications…", "job_id": job_id,
                })
                research_data = await gemini.research_object_dimensions(prompt_text)
                if research_data.get("has_real_world_objects"):
                    obj_names = [o.get("name", "?") for o in research_data.get("objects", [])]
                    log.info("Research layer found: %s project=%s", obj_names, project_id)

                await _ws_send_safe(ws, {
                    "type": "generation_progress", "progress": 0.30,
                    "message": "Analyzing design requirements…", "job_id": job_id,
                })
                design_spec = await gemini.generate_design_spec(prompt_text, research_data=research_data)
                if design_spec.get("base_shape"):
                    log.info("Design spec: base=%s features=%d project=%s",
                             design_spec["base_shape"], len(design_spec.get("features", [])), project_id)

            # Generate CadQuery code — for high-detail prompts, the FULL user prompt
            # is the primary context with NO simplification layers in between
            log.info("Generating CadQuery geometry via Gemini Pro project=%s", project_id)
            async with _ProgressHeartbeat(ws, job_id, start=0.35, end=0.50,
                                          message="Generating 3D geometry…"):
                cq_script = await gemini.generate_cadquery_fixture(
                    part_features=features,
                    touchpoints=touchpoints,
                    environment=env,
                    printer_profile=printer,
                    template_id=template_id,
                    user_prompt=prompt_text,
                    design_spec=design_spec if design_spec else None,
                    research_data=research_data if research_data else None,
                )
            log.info("CadQuery script generated (%d chars) project=%s", len(cq_script), project_id)

            # Stage 3: Validate code against spec before executing
            validation = await gemini.validate_cadquery_against_spec(
                cq_script, design_spec, prompt_text,
            )
            if not validation.get("pass", True):
                issues = validation.get("issues", [])
                log.warning("CadQuery validation failed project=%s: %s", project_id, issues)
                # Regenerate with specific feedback from validation
                await _ws_send_safe(ws, {
                    "type": "generation_progress", "progress": 0.52,
                    "message": "Refining geometry…", "job_id": job_id,
                })
                issue_text = "; ".join(issues[:3])
                cq_script = await gemini.retry_cadquery_with_error(
                    cq_script,
                    f"VALIDATION FAILED: {issue_text}. Fix the code to match the design spec.",
                    prompt_text,
                )
                log.info("CadQuery regenerated after validation (%d chars) project=%s", len(cq_script), project_id)

            # Stage 4: Execute CadQuery with retry on execution errors
            loop = asyncio.get_event_loop()
            last_error = None

            for attempt in range(1, MAX_CQ_ATTEMPTS + 1):
                attempt_label = f"attempt {attempt}/{MAX_CQ_ATTEMPTS}"
                await _ws_send_safe(ws, {
                    "type": "generation_progress", "progress": 0.55 if attempt == 1 else 0.68,
                    "message": f"Compiling 3D geometry… ({attempt_label})",
                    "job_id": job_id,
                })

                async with _ProgressHeartbeat(ws, job_id,
                                              start=0.55 if attempt == 1 else 0.68,
                                              end=0.75 if attempt == 1 else 0.80,
                                              message=f"Compiling 3D geometry… ({attempt_label})"):
                    result = await loop.run_in_executor(
                        None,
                        lambda s=cq_script: execute_cadquery_script(s, project_id, "fixture", version)
                    )

                gltf_url = result.get("gltf_url")

                if gltf_url and result.get("engine") != "zoo_fallback":
                    log.info("CadQuery OK project=%s %s gltf_url=%s", project_id, attempt_label, bool(gltf_url))
                    _cq_script_final = cq_script  # Save for DB storage
                    if result.get("dimensions_json"):
                        _cq_dimensions = result["dimensions_json"]
                    break

                last_error = result.get("error") or "CadQuery produced no geometry or empty mesh"
                log.warning("CadQuery %s failed project=%s: %s", attempt_label, project_id, last_error)

                if attempt < MAX_CQ_ATTEMPTS:
                    await _ws_send_safe(ws, {
                        "type": "generation_progress", "progress": 0.65,
                        "message": "Fixing CadQuery script…", "job_id": job_id,
                    })
                    cq_script = await gemini.retry_cadquery_with_error(
                        cq_script, str(last_error), prompt_text,
                    )
                    log.info("CadQuery retry script (%d chars) project=%s", len(cq_script), project_id)
                    gltf_url = None

            if result.get("engine") == "zoo_fallback":
                generation_errors.append("CadQuery execution failed; used Zoo.dev fallback")
                log.warning("CadQuery failed, Zoo.dev fallback used project=%s", project_id)

            if not gltf_url:
                raise RuntimeError(f"CadQuery failed after {MAX_CQ_ATTEMPTS} attempts: {last_error}")

            log.info("CadQuery geometry OK project=%s gltf_url=%s", project_id, bool(gltf_url))

        except _SkipSinglePart:
            pass  # Assembly already generated geometry — skip to completion steps
        except Exception as cq_exc:
            # Final fallback: Zoo.dev text-to-cad
            log.warning("CadQuery failed project=%s: %s — falling back to Zoo.dev", project_id, cq_exc)
            generation_errors.append(f"CadQuery failed ({str(cq_exc)[:100]}); using Zoo.dev")

            await _ws_send_safe(ws, {
                "type": "generation_progress", "progress": 0.55,
                "message": "CadQuery unavailable, generating via Zoo.dev AI…", "job_id": job_id,
            })

            try:
                from app.services.zoo_service import text_to_cad_gltf
                result = await text_to_cad_gltf(project_id, prompt_text, version)
                gltf_url = result.get("gltf_url")
                zoo_kcl = result.get("kcl")
                is_stub = bool(gltf_url and "_stub_" in str(gltf_url))

                if result.get("error"):
                    generation_errors.append(result["error"])
            except Exception as zoo_exc:
                log.error("Zoo.dev fallback also failed project=%s: %s", project_id, zoo_exc)
                generation_errors.append(f"Zoo.dev also failed: {str(zoo_exc)[:200]}")

        # Store CadQuery Python script if available (for node parametric editing), else KCL
        stored_kcl = _cq_script_final or zoo_kcl or kcl

        # Update the pre-inserted fixture record with final geometry + dimensions
        update_data = {
            "gltf_url": gltf_url,
            "kcl": stored_kcl,
        }
        # Include bounding box dimensions if CadQuery extracted them
        if _cq_dimensions:
            update_data["dimensions_json"] = _cq_dimensions
        update_result = sb.table("fixture_geometries").update(update_data).eq("id", fixture_id).execute()
        if hasattr(update_result, 'error') and update_result.error:
            log.error("Failed to update fixture_geometries gltf_url fixture=%s: %s", fixture_id, update_result.error)

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
                cadquery_script=_cq_script_final or "",
                user_prompt=prompt_text,
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
        _clarification_asked = False  # Track if we already asked clarification this session

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

            # ── Generation intents → clarify if needed, then generate ────────
            if intent in ("fixture_generation", "general_generation", "geometry_modification", "kcl_revision"):
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

                # ── Clarification check: ask before generating if spec is uncertain
                # Skip if: modification, already asked, OR high-detail prompt (user knows what they want)
                _prompt_dims = len(re.findall(r'\d+(?:\.\d+)?\s*mm|\bØ\d|\bdia(?:meter)?\b', content.lower()))
                skip_clarification = intent in ("geometry_modification", "kcl_revision") or _prompt_dims >= 4
                if not skip_clarification and _clarification_asked:
                    skip_clarification = True
                    # This is the user's answer to our questions — merge with original prompt
                    # Find the original user prompt (the one before clarification)
                    orig_prompts = [
                        h["content"] for h in history
                        if h.get("role") == "user" and h["content"] != content
                    ]
                    if orig_prompts:
                        task_prompt = f"{orig_prompts[-1]}\n\nUser clarified: {content}"
                    log.info("Skipping re-clarification (already asked), merged prompt project=%s", project_id)
                if not skip_clarification:
                    try:
                        pre_spec = await gemini.generate_design_spec(content)
                        confidence = await gemini.assess_spec_confidence(pre_spec, content)

                        if confidence.get("needs_clarification") and confidence.get("questions"):
                            questions = confidence["questions"][:3]
                            # Build a readable clarification message
                            clarif_text = "Before I generate, I need to clarify a few details:\n\n"
                            for q in questions:
                                clarif_text += f"**{q['question']}**\n"
                                for opt in q.get("options", []):
                                    clarif_text += f"  - {opt['label']}\n"
                                clarif_text += "\n"

                            # Send as clarification message
                            _clarification_asked = True
                            await websocket.send_json({
                                "type": "clarification_needed",
                                "message": clarif_text,
                                "questions": questions,
                                "spec_preview": pre_spec,
                            })

                            # Stream it as normal chat so it appears in the conversation
                            for chunk_text in [clarif_text[i:i+80] for i in range(0, len(clarif_text), 80)]:
                                await websocket.send_json({"type": "chunk", "content": chunk_text})
                            await websocket.send_json({"type": "done", "intent": "clarification", "job_id": None})

                            # Save assistant message
                            sb.table("conversation_messages").insert({
                                "id": str(uuid.uuid4()),
                                "project_id": project_id,
                                "role": "assistant",
                                "content": clarif_text,
                                "attachments": [],
                                "linked_node_id": None,
                                "created_at": datetime.now(timezone.utc).isoformat(),
                            }).execute()

                            # Return to message loop — user's answer will come as a
                            # regular message and _clarification_asked flag will skip
                            # re-asking and merge the prompts.
                            continue
                    except Exception as clarif_exc:
                        log.warning("Clarification check failed project=%s: %s — proceeding", project_id, clarif_exc)

                # Tell client generation is starting
                gen_job_id = str(uuid.uuid4())
                await websocket.send_json({
                    "type": "generation_queued",
                    "job_id": gen_job_id,
                    "message": "Generating your 3D model — this takes about 30 seconds.",
                })

                # Stream brief spec summary so user knows what's being built
                explanation_prompt = (
                    f"The user asked: {content!r}. "
                    "Briefly confirm what 3D model you are generating. "
                    "Include the specific shape, key dimensions, and features. "
                    "Do NOT invent features the user did not ask for. 2 sentences max."
                )
                # If this is a clarification answer, adjust the explanation
                if skip_clarification and task_prompt != content:
                    explanation_prompt = (
                        f"Based on the user's clarification: {content!r}, "
                        "confirm what you are now generating. 1-2 sentences. "
                        "Be specific about shape, dimensions, and features."
                    )
                full_response = ""
                async for chunk in gemini.stream_chat(explanation_prompt, history, project_ctx):
                    full_response += chunk
                    await websocket.send_json({"type": "chunk", "content": chunk})
                await websocket.send_json({"type": "done", "intent": intent, "job_id": gen_job_id})

                # Launch generation inline
                _gen_task = asyncio.create_task(
                    _run_generation_inline(websocket, project_id, task_prompt, sb, gen_job_id)
                )
                _background_tasks.add(_gen_task)
                _gen_task.add_done_callback(_background_tasks.discard)

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
