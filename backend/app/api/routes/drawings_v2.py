"""
Project-scoped drawing generation routes.
POST /api/projects/{id}/drawings/generate  — generate 2D drawings
GET  /api/projects/{id}/drawings           — list drawings
"""
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from app.services.drawing_service import generate_orthographic_svgs
from datetime import datetime, timezone
import uuid
import json
import logging
import httpx

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["drawings"])


def _fetch_step_bytes(sb, project_id: str) -> bytes | None:
    """
    Fetch the latest STEP file bytes for a project.
    Tries part_geometries first (uploaded STEP), then fixture_geometries.
    Returns None if no STEP URL is found or download fails.
    """
    # Try part_geometries (uploaded STEP files)
    geom_res = (
        sb.table("part_geometries")
        .select("step_file_url")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    step_url = None
    if geom_res.data and geom_res.data[0].get("step_file_url"):
        step_url = geom_res.data[0]["step_file_url"]

    if not step_url:
        log.info("No STEP URL found for project %s", project_id)
        return None

    try:
        resp = httpx.get(step_url, timeout=30)
        resp.raise_for_status()
        log.info(
            "Downloaded STEP file for project %s (%d bytes)",
            project_id, len(resp.content),
        )
        return resp.content
    except Exception as exc:
        log.error("Failed to download STEP from %s: %s", step_url, exc)
        return None


@router.post("/{project_id}/drawings/generate")
async def generate_drawings(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate 2D orthographic drawings (front, top, side) from the 3D model.
    Uses OCCT HLR for real projections when a STEP file is available.
    Falls back to feature-based stubs otherwise.
    Stores the result in the drawings table and returns the SVG data.
    """
    sb = get_supabase_client()

    proj = sb.table("projects").select("*").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    project = proj.data[0]
    project_name = project.get("name", "ScaleCAD Project")
    part_number = project.get("part_number") or "PART-001"

    # Try to fetch the actual STEP file for real HLR projections
    step_bytes = _fetch_step_bytes(sb, project_id)

    if step_bytes:
        log.info("Generating HLR orthographic views for project %s", project_id)
        svg_data = generate_orthographic_svgs(step_bytes)
    else:
        log.info("No STEP file — generating stub views for project %s", project_id)
        svg_data = generate_orthographic_svgs(b"")  # returns stubs

    # Add title block info
    now = datetime.now(timezone.utc)
    svg_data["title_block"] = {
        "project_name": project_name,
        "part_number": part_number,
        "revision": project.get("revision", "A"),
        "gdt_standard": project.get("gdt_standard", "ASME Y14.5-2018"),
        "date": now.strftime("%Y-%m-%d"),
        "drawn_by": "ScaleCAD AI",
        "scale": "FIT",
        "units": "mm",
    }

    # Persist to drawings table
    drawing_id = str(uuid.uuid4())
    sb.table("drawings").insert({
        "id": drawing_id,
        "project_id": project_id,
        "svg_json": svg_data,
        "created_at": now.isoformat(),
    }).execute()

    return {
        "id": drawing_id,
        "project_id": project_id,
        "status": "generated",
        "drawing": svg_data,
    }


@router.get("/{project_id}/drawings")
async def list_drawings(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all drawings for a project."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    res = (
        sb.table("drawings")
        .select("id,project_id,pdf_url,created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []
