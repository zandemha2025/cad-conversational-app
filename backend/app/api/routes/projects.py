from fastapi import APIRouter, HTTPException, Depends, status
from app.models.project import ProjectCreate, ProjectUpdate, ProjectResponse, ProjectStatus
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
import uuid
import logging
from datetime import datetime, timezone

router = APIRouter(prefix="/projects", tags=["projects"])
log = logging.getLogger(__name__)

TABLE = "projects"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/", response_model=list[ProjectResponse])
async def list_projects(
    q: str | None = None,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    query = sb.table(TABLE).select("*").eq("user_id", user_id).order("updated_at", desc=True)
    if q:
        query = query.ilike("name", f"%{q}%")
    res = query.execute()
    return [ProjectResponse(**row) for row in (res.data or [])]


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
async def create_project(
    body: ProjectCreate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    now = _now()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": body.name,
        "part_number": body.part_number,
        "revision": body.revision or "A",
        "template_id": body.template_id,
        "gdt_standard": body.gdt_standard,
        "quality_standard": body.quality_standard,
        "status": ProjectStatus.draft.value,
        "environment_json": body.environment.model_dump() if body.environment else None,
        "printer_profile_json": body.printer_profile.model_dump() if body.printer_profile else None,
        "created_at": now,
        "updated_at": now,
    }
    res = sb.table(TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create project")
    return ProjectResponse(**res.data[0])


@router.get("/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    try:
        res = sb.table(TABLE).select("*").eq("id", project_id).eq("user_id", user_id).execute()
    except Exception as e:
        log.error("get_project error: %s", e)
        raise HTTPException(status_code=404, detail="Project not found")
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**res.data[0])


@router.patch("/{project_id}", response_model=ProjectResponse)
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    updates = body.model_dump(exclude_none=True)
    updates["updated_at"] = _now()

    # Serialize nested models
    if "environment" in updates:
        updates["environment_json"] = updates.pop("environment")
    if "printer_profile" in updates:
        updates["printer_profile_json"] = updates.pop("printer_profile")

    res = (
        sb.table(TABLE)
        .update(updates)
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return ProjectResponse(**res.data[0])


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    sb.table(TABLE).delete().eq("id", project_id).eq("user_id", user_id).execute()


@router.post("/{project_id}/init")
async def init_project(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Called after the 4-step modal completes.
    Queues initial geometry jobs if a STEP file was already uploaded.
    """
    from app.tasks.generate_fixture import dispatch_generate_fixture
    dispatch_generate_fixture(project_id, "Initial fixture generation")
    return {"message": "Project initialisation queued", "project_id": project_id}
