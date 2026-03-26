"""
Generate Variations endpoints.

POST /api/projects/{project_id}/generate-variations
GET  /api/projects/{project_id}/variations
GET  /api/projects/{project_id}/variations/{variation_group_id}
"""
import uuid
from fastapi import APIRouter, HTTPException, Depends
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from app.models.geometry import (
    GenerateVariationsRequest,
    VariationResponse,
    VariationGroupResponse,
    VariationMetadata,
)
from datetime import datetime

router = APIRouter(prefix="/projects", tags=["variations"])

BACKEND_URL = "https://scalecad-api.fly.dev"


def _proxy_glb(project_id: str, gltf_url: str | None, variation_id: str) -> str | None:
    if not gltf_url or "r2.cloudflarestorage.com" not in gltf_url:
        return gltf_url
    return f"{BACKEND_URL}/api/projects/{project_id}/variations/{variation_id}/glb"


def _row_to_variation(row: dict, project_id: str) -> VariationResponse:
    meta_raw = row.get("variation_metadata") or {}
    meta = VariationMetadata(**meta_raw) if meta_raw else None
    return VariationResponse(
        id=row["id"],
        project_id=row["project_id"],
        version=row.get("version", 1),
        variation_group_id=row.get("variation_group_id", ""),
        variation_index=row.get("variation_index", 0),
        variation_metadata=meta,
        gltf_url=_proxy_glb(project_id, row.get("gltf_url"), row["id"]),
        generation_prompt=row.get("generation_prompt"),
        generated_at=row["generated_at"],
    )


@router.post("/{project_id}/generate-variations")
async def generate_variations(
    project_id: str,
    body: GenerateVariationsRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Queue generation of N design variations from a single prompt."""
    # Verify project belongs to user
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")

    group_id = str(uuid.uuid4())

    from app.tasks.generate_variations import generate_variations_task
    generate_variations_task.apply_async(
        args=[
            project_id,
            body.prompt,
            body.num_variations,
            body.variation_parameters,
            group_id,
        ],
        queue="normal",
    )

    return {
        "message": f"Generating {body.num_variations} variations",
        "variation_group_id": group_id,
        "project_id": project_id,
        "num_variations": body.num_variations,
    }


@router.get("/{project_id}/variations")
async def list_variation_groups(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return all variation groups for a project, newest first."""
    sb = get_supabase_client()
    res = (
        sb.table("fixture_geometries")
        .select("*")
        .eq("project_id", project_id)
        .not_.is_("variation_group_id", "null")
        .order("generated_at", desc=True)
        .execute()
    )
    rows = res.data or []

    # Group by variation_group_id
    groups: dict[str, list] = {}
    for row in rows:
        gid = row.get("variation_group_id", "")
        if gid not in groups:
            groups[gid] = []
        groups[gid].append(row)

    result = []
    for gid, group_rows in groups.items():
        # Sort variations by index within group
        group_rows.sort(key=lambda r: r.get("variation_index", 0))
        variations = [_row_to_variation(r, project_id) for r in group_rows]
        oldest = min(group_rows, key=lambda r: r["generated_at"])
        result.append(VariationGroupResponse(
            variation_group_id=gid,
            prompt=oldest.get("generation_prompt") or "",
            num_variations=len(variations),
            variations=variations,
            created_at=oldest["generated_at"],
        ))

    # Sort groups by created_at descending
    result.sort(key=lambda g: g.created_at, reverse=True)
    return result


@router.get("/{project_id}/variations/{variation_group_id}")
async def get_variation_group(
    project_id: str,
    variation_group_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return all variations in a specific group."""
    sb = get_supabase_client()
    res = (
        sb.table("fixture_geometries")
        .select("*")
        .eq("project_id", project_id)
        .eq("variation_group_id", variation_group_id)
        .order("variation_index")
        .execute()
    )
    rows = res.data or []
    if not rows:
        raise HTTPException(status_code=404, detail="Variation group not found")

    variations = [_row_to_variation(r, project_id) for r in rows]
    oldest = min(rows, key=lambda r: r["generated_at"])
    return VariationGroupResponse(
        variation_group_id=variation_group_id,
        prompt=oldest.get("generation_prompt") or "",
        num_variations=len(variations),
        variations=variations,
        created_at=oldest["generated_at"],
    )


@router.get("/{project_id}/variations/{variation_id}/glb")
async def proxy_variation_glb(
    project_id: str,
    variation_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Proxy a single variation's GLB bytes (bypasses R2 CORS)."""
    import httpx
    from fastapi.responses import StreamingResponse
    sb = get_supabase_client()
    res = (
        sb.table("fixture_geometries")
        .select("gltf_url")
        .eq("id", variation_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not res.data or not res.data[0].get("gltf_url"):
        raise HTTPException(status_code=404, detail="Variation GLB not found")

    r2_url = res.data[0]["gltf_url"]
    try:
        from app.core.storage import get_signed_download_url
        from app.core.config import settings
        endpoint_prefix = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/"
        key = r2_url.removeprefix(endpoint_prefix)
        bucket_prefix = f"{settings.R2_BUCKET}/"
        if key.startswith(bucket_prefix):
            key = key[len(bucket_prefix):]
        signed = get_signed_download_url(key, expires_in=3600)
    except Exception:
        signed = r2_url

    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(signed)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch from storage")

    return StreamingResponse(
        iter([r.content]),
        media_type=r.headers.get("content-type", "model/gltf-binary"),
        headers={"Cache-Control": "public, max-age=3600"},
    )
