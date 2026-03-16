"""
STEP file upload endpoint.
1. Validates file type + size
2. Uploads raw STEP to R2
3. Queues OCCT processing job
4. Returns 202 with job_id
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from app.api.deps import get_current_user_id
from app.core.storage import upload_step_file
from app.core.config import settings
from app.core.database import get_supabase_client
import uuid
import logging
from datetime import datetime, timezone

router = APIRouter(prefix="/projects", tags=["upload"])
log = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".step", ".stp", ".STEP", ".STP"}
PART_GEOMETRIES_TABLE = "part_geometries"


@router.post("/{project_id}/upload/step", status_code=status.HTTP_202_ACCEPTED)
async def upload_step(
    project_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    # ── Extension check ───────────────────────────────────────────────────────
    suffix = ""
    if file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    if suffix.lower() not in {".step", ".stp"}:
        raise HTTPException(status_code=400, detail="Only STEP / STP files are accepted")

    # ── Size check ────────────────────────────────────────────────────────────
    data = await file.read()
    if len(data) > settings.MAX_STEP_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File exceeds {settings.MAX_STEP_FILE_SIZE_MB} MB limit",
        )

    # ── Upload to R2 ──────────────────────────────────────────────────────────
    filename = file.filename or f"{project_id}.step"
    step_url = upload_step_file(project_id, filename, data)

    # ── Create DB record ──────────────────────────────────────────────────────
    geometry_id = str(uuid.uuid4())
    sb = get_supabase_client()
    sb.table(PART_GEOMETRIES_TABLE).insert({
        "id": geometry_id,
        "project_id": project_id,
        "step_file_url": step_url,
        "gltf_url": None,
        "features_json": None,
        "processing_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    # ── Queue OCCT job ────────────────────────────────────────────────────────
    from app.tasks.process_step import process_step_upload
    job = process_step_upload.apply_async(
        args=[geometry_id, project_id, step_url],
        queue="normal",
    )

    return {"job_id": job.id, "geometry_id": geometry_id, "status": "queued"}
