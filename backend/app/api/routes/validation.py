import asyncio
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from app.models.validation import (
    ValidationResult, ValidationSummary, ValidationRunRequest, ValidationMethod
)
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

router = APIRouter(prefix="/projects", tags=["validation"])
TABLE = "validation_results"


@router.get("/{project_id}/validation", response_model=list[ValidationResult])
async def get_validation_results(
    project_id: str,
    method: ValidationMethod | None = None,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    query = sb.table(TABLE).select("*").eq("project_id", project_id).order("ran_at", desc=True)
    if method:
        query = query.eq("method", method.value)
    res = query.execute()
    return [ValidationResult(**r) for r in (res.data or [])]


@router.get("/{project_id}/validation/summary", response_model=ValidationSummary)
async def get_validation_summary(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = (
        sb.table(TABLE)
        .select("method,error_count,warning_count,ran_at")
        .eq("project_id", project_id)
        .order("ran_at", desc=True)
        .execute()
    )
    rows = res.data or []
    dfm_errors = sum(r["error_count"] for r in rows if r["method"] in ("fdm", "cnc", "laser"))
    func_warn  = sum(r["warning_count"] for r in rows if r["method"] == "functional")
    std_warn   = sum(r["warning_count"] for r in rows if r["method"] == "standards")
    last_ran   = rows[0]["ran_at"] if rows else None
    return ValidationSummary(
        project_id=project_id,
        geometry_ok=True,
        dfm_errors=dfm_errors,
        functional_warnings=func_warn,
        standards_warnings=std_warn,
        last_ran=last_ran,
    )


@router.post("/{project_id}/validation/run")
async def run_validation(
    project_id: str,
    body: ValidationRunRequest | None = None,
    user_id: str = Depends(get_current_user_id),
):
    """Run validation directly (not via Celery) using asyncio.to_thread."""
    from app.services.validation_engine import (
        run_fdm, run_cnc, run_laser, run_functional, run_standards, run_inventory,
    )

    sb = get_supabase_client()

    # Load project + geometry + touchpoints
    proj_res = sb.table("projects").select("*").eq("id", project_id).single().execute()
    proj = proj_res.data or {}
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

    # BOM + inventory for inventory validation
    bom_res = sb.table("bom_items").select("*").eq("project_id", project_id).execute()
    bom_items = bom_res.data or []

    inv_res = sb.table("user_inventory").select("*").eq("user_id", user_id).execute()
    inventory = inv_res.data or []

    method_fns = {
        "fdm":        lambda: run_fdm(features, printer),
        "cnc":        lambda: run_cnc(features),
        "laser":      lambda: run_laser(features),
        "functional": lambda: run_functional(features, touchpoints),
        "standards":  lambda: run_standards(features, proj),
        "inventory":  lambda: run_inventory(bom_items, inventory),
    }

    target_methods = (
        [m.value for m in body.methods] if body and body.methods
        else list(method_fns.keys())
    )
    now = datetime.now(timezone.utc).isoformat()
    results = []

    for method in target_methods:
        fn = method_fns.get(method)
        if not fn:
            continue
        issues = await asyncio.to_thread(fn)
        errors   = sum(1 for i in issues if i["severity"] == "error")
        warnings = sum(1 for i in issues if i["severity"] == "warning")
        record = {
            "id": str(uuid.uuid4()),
            "project_id": project_id,
            "method": method,
            "issues_json": issues,
            "error_count": errors,
            "warning_count": warnings,
            "ran_at": now,
        }
        sb.table(TABLE).insert(record).execute()
        results.append({"method": method, "error_count": errors, "warning_count": warnings})

    job_id = str(uuid.uuid4())
    return {"job_id": job_id, "status": "completed", "methods_run": target_methods, "results": results}
