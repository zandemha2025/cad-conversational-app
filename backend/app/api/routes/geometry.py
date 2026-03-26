import httpx
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from app.models.geometry import PartGeometryResponse, FixtureGeometryResponse
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

router = APIRouter(prefix="/projects", tags=["geometry"])


BACKEND_URL = "https://scalecad-api.fly.dev"


def _proxy_url_for_r2(url: str | None, proxy_path: str) -> str | None:
    """Replace a private R2 URL with a backend proxy URL to avoid browser CORS issues."""
    if not url or "r2.cloudflarestorage.com" not in url:
        return url
    return f"{BACKEND_URL}/api{proxy_path}"


def _get_presigned_url(url: str | None) -> str | None:
    """Generate a presigned URL for a private R2 object URL."""
    if not url or "r2.cloudflarestorage.com" not in url:
        return url
    if "X-Amz-Signature" in url:
        return url
    try:
        from app.core.config import settings
        from app.core.storage import get_signed_download_url
        endpoint_prefix = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/"
        key = url.removeprefix(endpoint_prefix)
        bucket_prefix = f"{settings.R2_BUCKET}/"
        if key.startswith(bucket_prefix):
            key = key[len(bucket_prefix):]
        return get_signed_download_url(key, expires_in=3600)
    except Exception:
        return url


async def _stream_r2_object(r2_url: str) -> StreamingResponse:
    """Fetch an R2 object via presigned URL and stream it to the client."""
    signed = _get_presigned_url(r2_url)
    if not signed:
        raise HTTPException(status_code=404, detail="File not available")
    async with httpx.AsyncClient(timeout=30.0) as client:
        r = await client.get(signed)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to fetch from storage")
    content_type = r.headers.get("content-type", "model/gltf-binary")
    return StreamingResponse(
        iter([r.content]),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/{project_id}/geometry/part", response_model=PartGeometryResponse)
async def get_part_geometry(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = (
        sb.table("part_geometries")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No part geometry found")
    row = res.data[0]
    raw_gltf = row.get("gltf_url")
    return PartGeometryResponse(
        id=row["id"],
        project_id=row["project_id"],
        step_file_url=row["step_file_url"],
        gltf_url=_proxy_url_for_r2(raw_gltf, f"/projects/{project_id}/geometry/part/glb"),
        features=row.get("features_json"),
        processing_status=row.get("processing_status", "pending"),
        created_at=row["created_at"],
    )


@router.get("/{project_id}/geometry/fixture", response_model=FixtureGeometryResponse)
async def get_fixture_geometry(
    project_id: str,
    version: int | None = None,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    query = sb.table("fixture_geometries").select("*").eq("project_id", project_id)
    if version is not None:
        query = query.eq("version", version)
    else:
        query = query.order("version", desc=True).limit(1)
    res = query.execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="No fixture geometry found")
    row = res.data[0]
    raw_gltf = row.get("gltf_url")
    fix_ver = row.get("version", 1)
    return FixtureGeometryResponse(
        id=row["id"],
        project_id=row["project_id"],
        version=fix_ver,
        kcl=row.get("kcl"),
        gltf_url=_proxy_url_for_r2(raw_gltf, f"/projects/{project_id}/geometry/fixture/glb"),
        generation_prompt=row.get("generation_prompt"),
        generated_at=row["generated_at"],
    )


@router.get("/{project_id}/geometry/fixture/glb")
async def proxy_fixture_glb(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Proxy the fixture GLB through the backend to avoid browser CORS restrictions."""
    sb = get_supabase_client()
    res = (
        sb.table("fixture_geometries")
        .select("gltf_url")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data or not res.data[0].get("gltf_url"):
        raise HTTPException(status_code=404, detail="No fixture GLB found")
    return await _stream_r2_object(res.data[0]["gltf_url"])


@router.get("/{project_id}/geometry/part/glb")
async def proxy_part_glb(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Proxy the part GLTF through the backend to avoid browser CORS restrictions."""
    sb = get_supabase_client()
    res = (
        sb.table("part_geometries")
        .select("gltf_url")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data or not res.data[0].get("gltf_url"):
        raise HTTPException(status_code=404, detail="No part GLTF found")
    return await _stream_r2_object(res.data[0]["gltf_url"])


@router.get("/{project_id}/geometry/faces/{face_id}")
async def get_face_metadata(
    project_id: str,
    face_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return face-level metadata from the cached features_json."""
    sb = get_supabase_client()
    res = (
        sb.table("part_geometries")
        .select("features_json")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data or not res.data[0].get("features_json"):
        raise HTTPException(status_code=404, detail="No geometry features available")

    features = res.data[0]["features_json"]
    faces = features.get("faces", [])
    face = next((f for f in faces if f["id"] == face_id), None)
    if not face:
        raise HTTPException(status_code=404, detail=f"Face {face_id} not found")
    return face
