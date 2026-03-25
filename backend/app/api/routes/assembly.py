from fastapi import APIRouter, HTTPException, Depends
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

router = APIRouter(prefix="/projects", tags=["assembly"])

TABLE = "assembly_components"


@router.get("/{project_id}/assembly")
async def get_assembly(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return the assembly BOM — all components for the latest fixture."""
    sb = get_supabase_client()

    # Get the latest fixture_id for this project
    fixture_res = (
        sb.table("fixture_geometries")
        .select("id, version, generated_at")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if not fixture_res.data:
        return {"fixture_id": None, "fixture_version": None, "components": [], "total": 0}

    fixture = fixture_res.data[0]
    fixture_id = fixture["id"]

    comp_res = (
        sb.table(TABLE)
        .select("*")
        .eq("fixture_id", fixture_id)
        .order("created_at")
        .execute()
    )
    components = comp_res.data or []

    return {
        "fixture_id": fixture_id,
        "fixture_version": fixture["version"],
        "components": components,
        "total": len(components),
    }


@router.get("/{project_id}/assembly/{component_id}")
async def get_assembly_component(
    project_id: str,
    component_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return a single assembly component."""
    sb = get_supabase_client()
    res = (
        sb.table(TABLE)
        .select("*")
        .eq("id", component_id)
        .eq("project_id", project_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Component not found")
    return res.data
