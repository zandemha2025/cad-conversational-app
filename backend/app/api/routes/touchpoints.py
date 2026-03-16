from fastapi import APIRouter, HTTPException, Depends, status
from app.models.touchpoint import (
    TouchpointCreate, TouchpointUpdate, TouchpointResponse, ConstraintStatus
)
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
import uuid
import logging
from datetime import datetime, timezone

router = APIRouter(prefix="/projects", tags=["touchpoints"])
log = logging.getLogger(__name__)
TABLE = "touchpoints"


def _constraint_status(rows: list[dict]) -> ConstraintStatus:
    loc = [r for r in rows if r["type"] == "locating"]
    clm = [r for r in rows if r["type"] == "clamping"]
    sup = [r for r in rows if r["type"] == "support"]
    missing = []
    if len(loc) < 2: missing.append(f"Need at least 2 locating pins (have {len(loc)})")
    if len(clm) < 1: missing.append(f"Need at least 1 clamp (have {len(clm)})")
    if len(sup) < 3: missing.append(f"Need at least 3 support pads — Datum A (have {len(sup)})")
    return ConstraintStatus(
        locating_count=len(loc),
        clamping_count=len(clm),
        support_count=len(sup),
        fully_constrained=len(missing) == 0,
        missing=missing,
    )


@router.get("/{project_id}/touchpoints", response_model=list[TouchpointResponse])
async def list_touchpoints(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = sb.table(TABLE).select("*").eq("project_id", project_id).execute()
    return [TouchpointResponse(**r) for r in (res.data or [])]


@router.post("/{project_id}/touchpoints", response_model=TouchpointResponse, status_code=status.HTTP_201_CREATED)
async def add_touchpoint(
    project_id: str,
    body: TouchpointCreate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    row = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "label": body.label,
        "type": body.type.value,
        "face_id": body.face_id,
        "coords_json": body.coords,
        "detail": body.detail,
        "force_n": body.force_n,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = sb.table(TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to save touchpoint")

    # Async constraint re-solve
    from app.tasks.run_validation import run_constraint_check
    run_constraint_check.delay(project_id)

    return TouchpointResponse(**res.data[0])


@router.patch("/{project_id}/touchpoints/{tp_id}", response_model=TouchpointResponse)
async def update_touchpoint(
    project_id: str,
    tp_id: str,
    body: TouchpointUpdate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    updates = body.model_dump(exclude_none=True)
    if "type" in updates:
        updates["type"] = updates["type"].value
    res = sb.table(TABLE).update(updates).eq("id", tp_id).eq("project_id", project_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Touchpoint not found")
    return TouchpointResponse(**res.data[0])


@router.delete("/{project_id}/touchpoints/{tp_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_touchpoint(
    project_id: str,
    tp_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    sb.table(TABLE).delete().eq("id", tp_id).eq("project_id", project_id).execute()
    from app.tasks.run_validation import run_constraint_check
    run_constraint_check.delay(project_id)


@router.get("/{project_id}/touchpoints/constraint-status", response_model=ConstraintStatus)
async def get_constraint_status(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = sb.table(TABLE).select("type").eq("project_id", project_id).execute()
    return _constraint_status(res.data or [])
