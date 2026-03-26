from fastapi import APIRouter, HTTPException, Depends
from app.models.geometry import PartGeometryResponse, FixtureGeometryResponse
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

router = APIRouter(prefix="/projects", tags=["geometry"])


def _presign_if_private(url: str | None) -> str | None:
    """Return a 1-hour presigned URL when url points at a private R2 endpoint."""
    if not url or "r2.cloudflarestorage.com" not in url:
        return url
    try:
        from app.core.config import settings
        from app.core.storage import get_signed_download_url
        endpoint_prefix = f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/"
        key = url.removeprefix(endpoint_prefix)
        # Strip bucket name prefix if present
        bucket_prefix = f"{settings.R2_BUCKET}/"
        if key.startswith(bucket_prefix):
            key = key[len(bucket_prefix):]
        return get_signed_download_url(key, expires_in=3600)
    except Exception:
        return url


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
    return PartGeometryResponse(
        id=row["id"],
        project_id=row["project_id"],
        step_file_url=row["step_file_url"],
        gltf_url=_presign_if_private(row.get("gltf_url")),
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
    return FixtureGeometryResponse(
        id=row["id"],
        project_id=row["project_id"],
        version=row["version"],
        kcl=row.get("kcl"),
        gltf_url=_presign_if_private(row.get("gltf_url")),
        generation_prompt=row.get("generation_prompt"),
        generated_at=row["generated_at"],
    )


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
