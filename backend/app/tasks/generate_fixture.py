"""
Celery task: full fixture generation pipeline.

Flow:
  1. Fetch project context (features, touchpoints, env, printer, template)
  2. Gemini Pro → generate KCL
  3. Zoo.dev → compile KCL → GLTF
  4. Gemini Pro → generate node graph JSON
  5. Validation engine → run all checks
  6. Save everything to DB
  7. Publish progress events
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from celery import shared_task
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


@celery_app.task(name="app.tasks.generate_fixture.generate_fixture_task", bind=True, max_retries=1)
def generate_fixture_task(
    self,
    project_id: str,
    user_prompt: str | None,
    previous_description: str | None = None,
):
    log.info("generate_fixture project=%s modification=%s", project_id, bool(previous_description))
    sb = get_supabase_client()

    # ── Fetch context ──────────────────────────────────────────────────────────
    _publish(project_id, {"status": "generating", "message": "Assembling context…", "progress": 0.05})

    proj = sb.table("projects").select("*").eq("id", project_id).single().execute().data or {}
    env = proj.get("environment_json") or {}
    printer = proj.get("printer_profile_json") or {}
    template_id = proj.get("template_id", "generic_fixture")

    # Part features
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

    # Touchpoints
    tp_res = sb.table("touchpoints").select("*").eq("project_id", project_id).execute()
    touchpoints = tp_res.data or []

    # ── KCL generation ─────────────────────────────────────────────────────────
    _publish(project_id, {"status": "generating", "message": "Generating KCL code…", "progress": 0.25})

    # When modifying an existing design, prepend the previous description so
    # Gemini understands what it's working with.
    kcl_prompt = user_prompt or f"Generate a {template_id} fixture"
    if previous_description:
        kcl_prompt = (
            f"EXISTING FIXTURE DESIGN:\n{previous_description}\n\n"
            f"MODIFICATION REQUESTED:\n{kcl_prompt}\n\n"
            "Generate updated KCL that incorporates this modification into the existing design."
        )

    kcl = _run_async(gemini.generate_kcl(
        part_features=features,
        touchpoints=touchpoints,
        environment=env,
        printer_profile=printer,
        template_id=template_id,
        user_prompt=kcl_prompt,
    ))

    # ── Zoo.dev compilation ────────────────────────────────────────────────────
    _publish(project_id, {"status": "compiling", "message": "Compiling KCL → 3D geometry…", "progress": 0.50})

    from app.services.zoo_service import compile_kcl_to_gltf
    version = _next_version(sb, project_id)
    gltf_url = _run_async(compile_kcl_to_gltf(project_id, kcl, version))

    # Save fixture geometry record
    fixture_id = str(uuid.uuid4())
    sb.table("fixture_geometries").insert({
        "id": fixture_id,
        "project_id": project_id,
        "version": version,
        "kcl": kcl,
        "gltf_url": gltf_url,
        "generation_prompt": user_prompt,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # Generate and save design_description (best-effort — column may not exist yet)
    _publish(project_id, {"status": "generating", "message": "Summarizing design…", "progress": 0.60})
    try:
        design_description = _run_async(gemini.summarize_fixture_design(
            kcl_code=kcl,
            user_prompt=user_prompt or kcl_prompt,
        ))
        sb.table("fixture_geometries").update(
            {"design_description": design_description}
        ).eq("id", fixture_id).execute()
        log.info("design_description saved for fixture=%s", fixture_id)
    except Exception as e:
        log.warning("Could not save design_description for fixture=%s: %s", fixture_id, e)

    # ── Node graph ─────────────────────────────────────────────────────────────
    _publish(project_id, {"status": "generating", "message": "Building parametric node graph…", "progress": 0.70})

    node_graph = _run_async(gemini.generate_node_graph(
        part_features=features,
        touchpoints=touchpoints,
        environment=env,
        printer_profile=printer,
        template_id=template_id,
    ))

    graph_id = str(uuid.uuid4())
    sb.table("node_graphs").insert({
        "id": graph_id,
        "project_id": project_id,
        "nodes_json": node_graph.get("nodes", []),
        "connections_json": node_graph.get("connections", []),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # ── Validation ─────────────────────────────────────────────────────────────
    _publish(project_id, {"status": "validating", "message": "Running DFM validation…", "progress": 0.85})

    all_results = validate_all(
        features=features,
        printer_profile=printer,
        touchpoints=touchpoints,
        project=proj,
    )

    now = datetime.now(timezone.utc).isoformat()
    for method, issues in all_results.items():
        errors   = sum(1 for i in issues if i["severity"] == "error")
        warnings = sum(1 for i in issues if i["severity"] == "warning")
        sb.table("validation_results").insert({
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "method": method,
            "issues_json": issues,
            "error_count": errors,
            "warning_count": warnings,
            "ran_at": now,
        }).execute()

    # ── Done ───────────────────────────────────────────────────────────────────
    _publish(project_id, {
        "status": "done",
        "message": "Fixture ready!",
        "progress": 1.0,
        "fixture_id": fixture_id,
        "gltf_url": gltf_url,
    })

    # Trigger proactive analysis asynchronously (best effort)
    try:
        from app.tasks.proactive_analysis import proactive_analysis_task
        proactive_analysis_task.apply_async(args=[project_id], queue="low", countdown=5)
    except Exception as e:
        log.warning("Failed to queue proactive_analysis_task: %s", e)

    log.info("generate_fixture done project=%s fixture=%s", project_id, fixture_id)
    return {"fixture_id": fixture_id, "gltf_url": gltf_url}


@celery_app.task(name="app.tasks.generate_fixture.regenerate_subgraph", bind=True)
def regenerate_subgraph(self, project_id: str, node_id: str):
    """Re-run only the downstream sub-graph from a changed node."""
    log.info("regenerate_subgraph project=%s node=%s", project_id, node_id)
    # For now: re-run full generation (sub-graph routing is a future optimisation)
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
