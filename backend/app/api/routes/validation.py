from fastapi import APIRouter, HTTPException, Depends
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
        geometry_ok=True,   # set by OCCT task
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
    """Queue a full (or selective) re-validation run."""
    from app.tasks.run_validation import run_full_validation
    methods = [m.value for m in body.methods] if body and body.methods else None
    job = run_full_validation.apply_async(args=[project_id, methods], queue="normal")
    return {"job_id": job.id, "status": "queued"}
