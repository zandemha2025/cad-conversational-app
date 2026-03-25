"""
GET /api/projects/{project_id}/dimensions

Returns the dimensions_json for the latest fixture version.
"""
from fastapi import APIRouter, Depends
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

router = APIRouter(prefix="/projects", tags=["dimensions"])


@router.get("/{project_id}/dimensions")
async def get_dimensions(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = (
        sb.table("fixture_geometries")
        .select("dimensions_json")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data or not res.data[0].get("dimensions_json"):
        return {"dimensions": []}
    return {"dimensions": res.data[0]["dimensions_json"]}
