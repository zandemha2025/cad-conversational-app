"""
Version history endpoints.

GET  /api/projects/{project_id}/versions
GET  /api/projects/{project_id}/versions/{version}/diff?compare_to=<version>
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from app.services.gemini_service import GeminiService
import logging

router = APIRouter(prefix="/projects", tags=["versions"])
log = logging.getLogger(__name__)
gemini = GeminiService()


@router.get("/{project_id}/versions")
async def list_versions(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return all fixture geometry versions for a project, newest first."""
    sb = get_supabase_client()
    # Verify ownership
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")

    res = (
        sb.table("fixture_geometries")
        .select("id,version,gltf_url,generation_prompt,generated_at")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .execute()
    )
    return res.data or []


@router.get("/{project_id}/versions/{version}/diff")
async def get_version_diff(
    project_id: str,
    version: int,
    compare_to: int = Query(..., description="Older version to compare against"),
    user_id: str = Depends(get_current_user_id),
):
    """
    Use Gemini to produce a human-readable diff between two fixture versions.
    `version` is the newer version; `compare_to` is the older baseline.
    """
    sb = get_supabase_client()
    # Verify ownership
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")

    # Fetch both versions (include kcl for richer diff context)
    from_res = (
        sb.table("fixture_geometries")
        .select("version,generation_prompt,kcl,generated_at")
        .eq("project_id", project_id)
        .eq("version", compare_to)
        .execute()
    )
    to_res = (
        sb.table("fixture_geometries")
        .select("version,generation_prompt,kcl,generated_at")
        .eq("project_id", project_id)
        .eq("version", version)
        .execute()
    )

    if not from_res.data:
        raise HTTPException(status_code=404, detail=f"Version {compare_to} not found")
    if not to_res.data:
        raise HTTPException(status_code=404, detail=f"Version {version} not found")

    from_ver = from_res.data[0]
    to_ver = to_res.data[0]

    diff = await gemini.generate_version_diff(
        from_version=from_ver["version"],
        to_version=to_ver["version"],
        from_prompt=from_ver.get("generation_prompt") or "",
        to_prompt=to_ver.get("generation_prompt") or "",
        from_kcl=from_ver.get("kcl") or "",
        to_kcl=to_ver.get("kcl") or "",
    )
    return diff
