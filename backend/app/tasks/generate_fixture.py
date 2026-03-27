"""
Celery task: full fixture generation pipeline with AI decomposition.

Flow:
  1. Fetch project context (features, touchpoints, env, printer, template)
  2. Gemini Flash → decompose prompt (simple | assembly with engine routing)
  3a. Simple: one Zoo.dev or CadQuery call
  3b. Assembly: parallel sub-component generation (Zoo.dev + CadQuery mix)
  4. Save fixture_geometries + assembly_components records
  5. Gemini Pro → generate node graph JSON
  6. Validation engine → run all checks
  7. Publish progress events throughout
"""
import asyncio
import json
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone

from celery import shared_task  # noqa: F401 — keep for Celery discovery
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import get_supabase_client
from app.services.gemini_service import GeminiService
from app.services.validation_engine import run_all as validate_all

log = logging.getLogger(__name__)
gemini = GeminiService()


def _run_async(coro):
    """Run an async coroutine from a synchronous Celery task."""
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _publish(project_id: str, data: dict):
    try:
        import redis
        r = redis.from_url(settings.REDIS_URL)
        r.publish(f"scalecad:gen:{project_id}", json.dumps(data, default=str))
    except Exception as e:
        log.warning("Redis publish failed: %s", e)


# ── Single-component generation ───────────────────────────────────────────────

def _generate_single_zoo(project_id: str, prompt: str, version: int) -> dict:
    from app.services.zoo_service import text_to_cad_gltf
    return _run_async(text_to_cad_gltf(project_id, prompt, version))


def _generate_single_cadquery(
    project_id: str,
    component_name: str,
    description: str,
    version: int,
) -> dict:
    cq_script = _run_async(
        gemini.generate_cadquery_code(component_name, description)
    )
    from app.services.cadquery_service import execute_cadquery_script
    return execute_cadquery_script(cq_script, project_id, component_name, version)


def _generate_component(
    project_id: str,
    comp: dict,
    version: int,
    index: int,
) -> dict:
    """Generate one assembly sub-component. Called from a ThreadPoolExecutor."""
    name = comp.get("name", f"component_{index}")
    engine = comp.get("engine", "zoo")
    prompt = comp.get("prompt", name)
    description = comp.get("description", prompt)

    log.info("Generating component '%s' via %s project=%s", name, engine, project_id)
    try:
        if engine == "cadquery":
            result = _generate_single_cadquery(project_id, name, description, version)
        else:
            result = _generate_single_zoo(project_id, prompt, version)
        result["name"] = name
        result["engine_used"] = result.get("engine", engine)
        return result
    except Exception as exc:
        log.error("Component '%s' generation failed: %s", name, exc)
        return {"name": name, "gltf_url": None, "step_url": None, "engine_used": engine}


# ── Main Celery task ──────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.generate_fixture.generate_fixture_task", bind=True, max_retries=1)
def generate_fixture_task(self, project_id: str, user_prompt: str | None):
    log.info("generate_fixture project=%s", project_id)
    sb = get_supabase_client()

    try:
        return _run_generation_pipeline(self, project_id, user_prompt, sb)
    except Exception as exc:
        log.exception("generate_fixture FAILED project=%s: %s", project_id, exc)
        _publish(project_id, {
            "status": "error",
            "message": f"Generation failed: {str(exc)[:200]}",
            "progress": 0,
        })
        # Save error as a conversation message so user sees it in chat
        try:
            sb.table("conversation_messages").insert({
                "id": str(uuid.uuid4()),
                "project_id": project_id,
                "role": "system",
                "content": f"⚠️ Fixture generation failed: {str(exc)[:300]}. Please try again or simplify your request.",
                "attachments": [],
                "linked_node_id": None,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }).execute()
        except Exception:
            pass
        raise


def _run_generation_pipeline(self, project_id: str, user_prompt: str | None, sb):
    """Inner pipeline — separated so top-level task can catch and report errors."""

    # ── Fetch context ──────────────────────────────────────────────────────────
    _publish(project_id, {"status": "generating", "message": "Assembling context…", "progress": 0.05})

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

    # ── AI decomposition ───────────────────────────────────────────────────────
    _publish(project_id, {"status": "analyzing", "message": "Analyzing design complexity…", "progress": 0.10})

    decomposition = _run_async(gemini.decompose_prompt(prompt_text))
    is_assembly = decomposition.get("type") == "assembly"
    components = decomposition.get("components", [])

    if is_assembly and components:
        names = ", ".join(c.get("name", "?") for c in components)
        _publish(project_id, {
            "status": "decomposing",
            "message": f"Breaking into {len(components)} sub-components: {names}…",
            "progress": 0.15,
            "decomposition": {"type": "assembly", "components": [
                {"name": c.get("name"), "engine": c.get("engine", "zoo")} for c in components
            ]},
        })
        log.info("Assembly decomposition: %d components — %s", len(components), names)
    else:
        # Simple — use Gemini-enhanced prompt or original
        prompt_text = decomposition.get("prompt", prompt_text)
        engine_hint = decomposition.get("engine", "zoo")
        _publish(project_id, {
            "status": "generating",
            "message": f"Generating geometry via {'CadQuery' if engine_hint == 'cadquery' else 'Zoo.dev'}…",
            "progress": 0.20,
        })

    # ── KCL generation (for parametric node graph) ─────────────────────────────
    _publish(project_id, {"status": "generating", "message": "Generating parametric model…", "progress": 0.25})

    kcl = _run_async(gemini.generate_kcl(
        part_features=features,
        touchpoints=touchpoints,
        environment=env,
        printer_profile=printer,
        template_id=template_id,
        user_prompt=prompt_text,
    ))

    # ── Geometry generation ────────────────────────────────────────────────────
    version = _next_version(sb, project_id)
    fixture_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    # Pre-insert fixture_geometries so assembly_components FK is valid during generation
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

    if is_assembly and components:
        # ── ASSEMBLY PATH ──────────────────────────────────────────────────────
        gltf_url, zoo_kcl, assembly_records = _generate_assembly(
            project_id, components, version, fixture_id, sb, kcl
        )
        # Check if any components failed
        failed = [r["name"] for r in assembly_records if not r.get("gltf_url")]
        if failed:
            generation_errors.append(f"Components failed to generate: {', '.join(failed)}")
        stored_kcl = zoo_kcl or kcl
    else:
        # ── SINGLE-COMPONENT PATH ──────────────────────────────────────────────
        _publish(project_id, {"status": "compiling", "message": "Generating 3D geometry…", "progress": 0.50})

        engine_hint = decomposition.get("engine", "zoo")
        log.info("Simple geometry engine_hint=%s project=%s", engine_hint, project_id)
        try:
            if engine_hint == "cadquery":
                description = decomposition.get("prompt", prompt_text)
                result = _generate_single_cadquery(project_id, "fixture", description, version)
                gltf_url = result.get("gltf_url")
                zoo_kcl = None
                if result.get("engine") == "zoo_fallback":
                    generation_errors.append("CadQuery generation failed; used Zoo.dev fallback")
            else:
                result = _generate_single_zoo(project_id, prompt_text, version)
                gltf_url = result.get("gltf_url")
                zoo_kcl = result.get("kcl")
        except Exception as gen_exc:
            log.error("Geometry generation failed project=%s: %s", project_id, gen_exc)
            gltf_url = None
            zoo_kcl = None
            generation_errors.append(f"Geometry generation error: {str(gen_exc)[:200]}")

        stored_kcl = zoo_kcl or kcl
        assembly_records = []

    # Check if we got a stub GLB instead of real geometry
    is_stub = False
    if gltf_url and "_stub_" in gltf_url:
        is_stub = True
        generation_errors.append(
            "Zoo.dev could not generate the requested geometry. "
            "A placeholder model was used. Try rephrasing your request with more specific dimensions."
        )

    # ── Update fixture geometry with final gltf_url and kcl ────────────────────
    sb.table("fixture_geometries").update({
        "gltf_url": gltf_url,
        "kcl": stored_kcl,
    }).eq("id", fixture_id).execute()

    # ── Node graph ─────────────────────────────────────────────────────────────
    _publish(project_id, {"status": "generating", "message": "Building parametric node graph…", "progress": 0.80})

    try:
        node_graph = _run_async(gemini.generate_node_graph(
            part_features=features,
            touchpoints=touchpoints,
            environment=env,
            printer_profile=printer,
            template_id=template_id,
        ))

        sb.table("node_graphs").insert({
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "nodes_json": node_graph.get("nodes", []),
            "connections_json": node_graph.get("connections", []),
            "generated_at": now_iso,
        }).execute()
    except Exception as ng_exc:
        log.error("Node graph generation failed project=%s: %s", project_id, ng_exc)

    # ── Validation ─────────────────────────────────────────────────────────────
    _publish(project_id, {"status": "validating", "message": "Running DFM validation…", "progress": 0.90})

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

    # ── Done ───────────────────────────────────────────────────────────────────
    if not gltf_url:
        # Total failure — no model at all
        _publish(project_id, {
            "status": "error",
            "message": "Generation failed — no 3D model could be produced. Please try a simpler request or rephrase.",
            "progress": 0,
            "fixture_id": fixture_id,
        })
        # Save error to chat so user sees it
        sb.table("conversation_messages").insert({
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "role": "system",
            "content": "⚠️ I wasn't able to generate a 3D model for this request. This can happen when the geometry is too complex or the description is ambiguous. Try breaking it into simpler parts or adding specific dimensions.",
            "attachments": [],
            "linked_node_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    elif is_stub:
        # Partial failure — stub model
        done_msg = (
            "⚠️ Generation partially succeeded — a placeholder model was created because "
            "the CAD engine couldn't fully interpret the request. Try adding specific dimensions "
            "(e.g., '200mm x 150mm base plate, 12mm thick')."
        )
        _publish(project_id, {
            "status": "done_with_warnings",
            "message": done_msg,
            "progress": 1.0,
            "fixture_id": fixture_id,
            "gltf_url": gltf_url,
            "is_stub": True,
            "warnings": generation_errors,
            "is_assembly": bool(assembly_records),
            "assembly_component_count": len(assembly_records),
        })
        sb.table("conversation_messages").insert({
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "role": "system",
            "content": done_msg,
            "attachments": [],
            "linked_node_id": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }).execute()
    else:
        done_msg = (
            f"Assembly ready! {len(assembly_records)} components generated."
            if assembly_records else "Fixture ready!"
        )
        if generation_errors:
            done_msg += " (with warnings: " + "; ".join(generation_errors) + ")"
        _publish(project_id, {
            "status": "done",
            "message": done_msg,
            "progress": 1.0,
            "fixture_id": fixture_id,
            "gltf_url": gltf_url,
            "is_assembly": bool(assembly_records),
            "assembly_component_count": len(assembly_records),
        })

    try:
        from app.tasks.proactive_analysis import proactive_analysis_task
        proactive_analysis_task.apply_async(args=[project_id], queue="low", countdown=5)
    except Exception as e:
        log.warning("Failed to queue proactive_analysis_task: %s", e)

    log.info("generate_fixture done project=%s fixture=%s components=%d errors=%s",
             project_id, fixture_id, len(assembly_records), generation_errors or "none")
    return {"fixture_id": fixture_id, "gltf_url": gltf_url}


def _generate_assembly(
    project_id: str,
    components: list[dict],
    version: int,
    fixture_id: str,
    sb,
    fallback_kcl: str,
) -> tuple[str | None, str | None, list[dict]]:
    """
    Generate all sub-components in parallel and insert assembly_components records.
    Returns (primary_gltf_url, zoo_kcl, assembly_records).
    """
    results: dict[str, dict] = {}
    total = len(components)

    with ThreadPoolExecutor(max_workers=min(total, 4)) as executor:
        future_to_comp = {
            executor.submit(_generate_component, project_id, comp, version, i): comp
            for i, comp in enumerate(components)
        }
        done_count = 0
        for future in as_completed(future_to_comp):
            comp = future_to_comp[future]
            name = comp.get("name", "component")
            try:
                result = future.result()
            except Exception as exc:
                log.error("Component '%s' future raised: %s", name, exc)
                result = {"name": name, "gltf_url": None, "step_url": None}
            results[name] = result
            done_count += 1
            _publish(project_id, {
                "status": "generating",
                "message": f"Generated {name} ({done_count}/{total})…",
                "progress": 0.15 + 0.60 * done_count / total,
            })

    # Save assembly_components and collect records
    assembly_records = []
    primary_gltf_url = None
    zoo_kcl = None
    now_iso = datetime.now(timezone.utc).isoformat()

    for i, comp in enumerate(components):
        name = comp.get("name", f"component_{i}")
        result = results.get(name, {})
        gltf_url = result.get("gltf_url")
        comp_type = comp.get("component_type", "custom")

        if i == 0:
            primary_gltf_url = gltf_url

        comp_id = str(uuid.uuid4())
        try:
            sb.table("assembly_components").insert({
                "id": comp_id,
                "fixture_id": fixture_id,
                "project_id": project_id,
                "name": name,
                "component_type": comp_type,
                "description": comp.get("description", name),
                "gltf_url": gltf_url,
                "position_json": None,
                "rotation_json": None,
                "material": "6061-T6 aluminum",
                "created_at": now_iso,
            }).execute()
        except Exception as e:
            log.error("Failed to insert assembly_component '%s': %s", name, e)

        assembly_records.append({
            "id": comp_id,
            "name": name,
            "component_type": comp_type,
            "gltf_url": gltf_url,
            "engine": result.get("engine_used", comp.get("engine", "zoo")),
        })

    return primary_gltf_url, zoo_kcl, assembly_records


# ── Supporting tasks ──────────────────────────────────────────────────────────

@celery_app.task(name="app.tasks.generate_fixture.regenerate_subgraph", bind=True)
def regenerate_subgraph(self, project_id: str, node_id: str):
    """Re-run only the downstream sub-graph from a changed node."""
    log.info("regenerate_subgraph project=%s node=%s", project_id, node_id)
    generate_fixture_task.apply_async(args=[project_id, f"Update node {node_id}"], queue="normal")
    return {"status": "queued"}


@celery_app.task(name="app.tasks.generate_fixture.queue_initial_generation")
def queue_initial_generation(project_id: str):
    """Triggered after project init if STEP already uploaded."""
    generate_fixture_task.apply_async(args=[project_id, "Initial fixture generation"], queue="normal")


def _next_version(sb, project_id: str) -> int:
    res = (
        sb.table("fixture_geometries")
        .select("version")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]["version"] + 1
    return 1
