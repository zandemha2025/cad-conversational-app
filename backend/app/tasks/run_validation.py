"""
Celery task: run validation passes.
"""
import logging
import uuid
from datetime import datetime, timezone
from app.core.celery_app import celery_app
from app.core.database import get_supabase_client
from app.services.validation_engine import run_all, run_fdm, run_cnc, run_laser, run_functional, run_standards

log = logging.getLogger(__name__)

METHOD_MAP = {
    "fdm":        run_fdm,
    "cnc":        run_cnc,
    "laser":      run_laser,
    "functional": run_functional,
    "standards":  run_standards,
}


@celery_app.task(name="app.tasks.run_validation.run_full_validation", bind=True)
def run_full_validation(self, project_id: str, methods: list[str] | None = None):
    log.info("run_full_validation project=%s methods=%s", project_id, methods)
    sb = get_supabase_client()

    proj = sb.table("projects").select("*").eq("id", project_id).single().execute().data or {}
    printer = proj.get("printer_profile_json") or {}

    geom_res = (
        sb.table("part_geometries")
        .select("features_json")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    features = geom_res.data[0].get("features_json") or {} if geom_res.data else {}

    tp_res = sb.table("touchpoints").select("*").eq("project_id", project_id).execute()
    touchpoints = tp_res.data or []

    target_methods = methods or list(METHOD_MAP.keys())
    now = datetime.now(timezone.utc).isoformat()

    for method in target_methods:
        if method == "fdm":
            issues = run_fdm(features, printer)
        elif method == "cnc":
            issues = run_cnc(features)
        elif method == "laser":
            issues = run_laser(features)
        elif method == "functional":
            issues = run_functional(features, touchpoints)
        elif method == "standards":
            issues = run_standards(features, proj)
        else:
            continue

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

    return {"project_id": project_id, "methods_run": target_methods}


@celery_app.task(name="app.tasks.run_validation.run_constraint_check")
def run_constraint_check(project_id: str):
    """Re-check 3-2-1 constraint after touchpoint add/delete."""
    run_full_validation.apply_async(args=[project_id, ["functional"]], queue="normal")
