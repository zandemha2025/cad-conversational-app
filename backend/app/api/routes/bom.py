from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
import uuid
from datetime import datetime, timezone

router = APIRouter(prefix="/projects", tags=["drawing"])
TABLE_DRAWING = "drawings"
TABLE_BOM     = "bom_items"


class BomItem(BaseModel):
    item_no: int
    part_number: str
    description: str
    quantity: int
    material: str = ""
    finish: str = ""


@router.get("/{project_id}/drawing")
async def get_drawing(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = sb.table(TABLE_DRAWING).select("*").eq("project_id", project_id).order("id", desc=True).limit(1).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="No drawing found")
    return res.data[0]


@router.get("/{project_id}/bom", response_model=list[BomItem])
async def get_bom(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = sb.table(TABLE_BOM).select("*").eq("project_id", project_id).order("item_no").execute()
    return [BomItem(**r) for r in (res.data or [])]


@router.post("/{project_id}/drawing/export")
async def export_drawing_pdf(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    from app.tasks.export import export_task
    job = export_task.apply_async(args=[project_id, "pdf"], queue="low")
    return {"job_id": job.id, "status": "queued"}
