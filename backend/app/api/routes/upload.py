"""
File upload endpoints.

POST /projects/{project_id}/upload/step  — STEP file for OCCT processing
POST /projects/{project_id}/upload-part  — any part file (STEP/STL/OBJ) for AI fixture design
"""
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, status
from app.api.deps import get_current_user_id
from app.core.storage import upload_step_file, upload_part_file
from app.core.config import settings
from app.core.database import get_supabase_client
import uuid
import asyncio
import logging
from datetime import datetime, timezone

router = APIRouter(prefix="/projects", tags=["upload"])
log = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = {".step", ".stp", ".STEP", ".STP"}
PART_GEOMETRIES_TABLE = "part_geometries"

ALLOWED_PART_EXTENSIONS = {".step", ".stp", ".stl", ".obj"}
PART_CONTENT_TYPES = {
    ".step": "application/octet-stream",
    ".stp":  "application/octet-stream",
    ".stl":  "model/stl",
    ".obj":  "model/obj",
}
MAX_PART_SIZE = 50 * 1024 * 1024  # 50 MB


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


# ── Part upload endpoint (STEP / STL / OBJ) ───────────────────────────────────

@router.post("/{project_id}/upload-part")
async def upload_part(
    project_id: str,
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """
    Upload an existing part file so the AI can design a fixture around it.
    Accepts STEP, STP, STL, OBJ — max 50 MB.
    Returns { part_id, file_url, file_name, file_type, ai_description }.
    """
    # ── Extension check ───────────────────────────────────────────────────────
    suffix = ""
    if file.filename:
        suffix = "." + file.filename.rsplit(".", 1)[-1] if "." in file.filename else ""
    if suffix.lower() not in ALLOWED_PART_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Only STEP, STL, or OBJ files are accepted",
        )

    # ── Size check ────────────────────────────────────────────────────────────
    data = await file.read()
    if len(data) > MAX_PART_SIZE:
        raise HTTPException(status_code=413, detail="File exceeds 50 MB limit")

    # ── Upload to R2 ──────────────────────────────────────────────────────────
    filename = file.filename or f"part_{project_id}{suffix}"
    content_type = PART_CONTENT_TYPES.get(suffix.lower(), "application/octet-stream")
    file_url = upload_part_file(project_id, filename, data, content_type)

    # ── AI description (best-effort, from filename) ───────────────────────────
    ai_description: str | None = None
    try:
        from app.services.gemini_service import GeminiService
        _gemini = GeminiService()
        model = _gemini._get_flash()
        prompt = (
            f"In one sentence, describe what kind of machined part or component this is "
            f"based solely on its filename: '{filename}'. "
            "Be specific about likely material, geometry, and manufacturing application."
        )
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        ai_description = resp.text.strip()
    except Exception as e:
        log.warning("AI description failed for %s: %s", filename, e)

    # ── Create DB record — store file info in features_json._file_info ─────────
    # (No schema migration required; uses existing JSONB column)
    part_id = str(uuid.uuid4())
    sb = get_supabase_client()
    file_info = {
        "_file_info": {
            "file_name":       filename,
            "file_type":       suffix.lstrip(".").lower(),
            "file_url":        file_url,
            "file_size_bytes": len(data),
            "ai_description":  ai_description,
        }
    }
    sb.table(PART_GEOMETRIES_TABLE).insert({
        "id":               part_id,
        "project_id":       project_id,
        "step_file_url":    file_url if suffix.lower() in {".step", ".stp"} else None,
        "gltf_url":         None,
        "features_json":    file_info,
        "processing_status": "pending",
        "created_at":       datetime.now(timezone.utc).isoformat(),
    }).execute()

    log.info("Part uploaded project=%s part_id=%s file=%s", project_id, part_id, filename)
    return {
        "part_id":         part_id,
        "file_url":        file_url,
        "file_name":       filename,
        "file_type":       suffix.lstrip(".").lower(),
        "ai_description":  ai_description,
    }
