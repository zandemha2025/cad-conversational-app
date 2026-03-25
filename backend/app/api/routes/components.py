"""
Standard component library routes.

GET  /api/components/library                     — full catalog (optional ?category=)
POST /api/projects/{project_id}/components/add   — add a standard component to a project
GET  /api/projects/{project_id}/components       — list components added to a project
DELETE /api/projects/{project_id}/components/{item_id} — remove a component from a project
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from app.data.standard_components import (
    STANDARD_COMPONENTS, CATEGORIES, get_component,
)
from datetime import datetime, timezone
import uuid
import logging

log = logging.getLogger(__name__)
router = APIRouter(tags=["components"])


# ── Catalog endpoint ──────────────────────────────────────────────────────────

@router.get("/components/library")
async def list_component_library(
    category: Optional[str] = Query(None, description="Filter by category slug"),
):
    """Return the standard component catalog, optionally filtered by category."""
    items = STANDARD_COMPONENTS
    if category:
        if category not in CATEGORIES:
            raise HTTPException(400, f"Unknown category '{category}'. Valid: {', '.join(CATEGORIES)}")
        items = [c for c in items if c["category"] == category]

    return {
        "categories": CATEGORIES,
        "components": items,
        "total": len(items),
    }


# ── Project component CRUD ────────────────────────────────────────────────────

class AddComponentBody(BaseModel):
    component_id: str
    quantity: int = 1
    position_notes: str = ""


@router.post("/projects/{project_id}/components/add", status_code=201)
async def add_component_to_project(
    project_id: str,
    body: AddComponentBody,
    user_id: str = Depends(get_current_user_id),
):
    """Add a standard component to a project's assembly list."""
    sb = get_supabase_client()

    # Verify project ownership
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    # Validate component exists
    component = get_component(body.component_id)
    if not component:
        raise HTTPException(404, f"Component '{body.component_id}' not found in catalog")

    if body.quantity < 1:
        raise HTTPException(400, "Quantity must be at least 1")

    item_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    try:
        sb.table("project_components").insert({
            "id": item_id,
            "project_id": project_id,
            "component_id": body.component_id,
            "component_name": component["name"],
            "category": component["category"],
            "quantity": body.quantity,
            "position_notes": body.position_notes,
            "specifications": component.get("specifications", {}),
            "created_at": now,
        }).execute()
    except Exception as e:
        log.error("add_component error: %s", e)
        # Table may not exist yet — return graceful response
        raise HTTPException(500, "Could not save component. Ensure the project_components table exists.")

    return {
        "id": item_id,
        "project_id": project_id,
        "component_id": body.component_id,
        "component_name": component["name"],
        "category": component["category"],
        "quantity": body.quantity,
        "position_notes": body.position_notes,
        "specifications": component.get("specifications", {}),
        "prompt_hint": component.get("prompt_hint", ""),
    }


@router.get("/projects/{project_id}/components")
async def list_project_components(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all standard components added to a project."""
    sb = get_supabase_client()

    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    try:
        res = (
            sb.table("project_components")
            .select("*")
            .eq("project_id", project_id)
            .order("created_at")
            .execute()
        )
        return res.data or []
    except Exception as e:
        log.warning("list_project_components — table may not exist yet: %s", e)
        return []


@router.delete("/projects/{project_id}/components/{item_id}", status_code=204)
async def remove_project_component(
    project_id: str,
    item_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Remove a component from a project."""
    sb = get_supabase_client()

    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    try:
        sb.table("project_components").delete().eq("id", item_id).eq("project_id", project_id).execute()
    except Exception as e:
        log.warning("remove_project_component error: %s", e)
