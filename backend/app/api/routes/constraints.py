"""
Assembly constraints routes.
GET    /api/projects/{id}/constraints              — list constraints
POST   /api/projects/{id}/constraints              — create constraint
PATCH  /api/projects/{id}/constraints/{cid}        — update constraint
DELETE /api/projects/{id}/constraints/{cid}        — delete constraint
POST   /api/projects/{id}/constraints/validate-all — validate all constraints
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from datetime import datetime, timezone
import uuid
import logging
import math

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["constraints"])

VALID_TYPES = {"fixed", "coincident", "parallel", "perpendicular", "distance", "angle"}


class ConstraintCreate(BaseModel):
    type: str
    part_a: str
    part_b: str = ""
    params: dict = {}


class ConstraintUpdate(BaseModel):
    type: Optional[str] = None
    part_a: Optional[str] = None
    part_b: Optional[str] = None
    params: Optional[dict] = None


def _validate_constraint(c_type: str, params: dict) -> tuple[bool, Optional[str]]:
    """
    Validate constraint satisfiability rules.
    Returns (is_valid, error_msg).
    """
    if c_type not in VALID_TYPES:
        return False, f"Unknown constraint type: {c_type}"

    if c_type == "distance":
        d = params.get("distance_mm", 0)
        if d < 0:
            return False, "Distance must be non-negative"

    if c_type == "angle":
        a = params.get("angle_deg", 0)
        if not (0 <= a <= 360):
            return False, "Angle must be between 0 and 360 degrees"

    # Fixed constraint: no second part needed
    if c_type == "fixed":
        return True, None

    return True, None


@router.get("/{project_id}/constraints")
async def list_constraints(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all assembly constraints for a project."""
    sb = get_supabase_client()
    res = (
        sb.table("assembly_constraints")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    )
    rows = res.data or []
    for r in rows:
        if isinstance(r.get("params_json"), str):
            import json
            r["params_json"] = json.loads(r["params_json"])
    return rows


@router.post("/{project_id}/constraints", status_code=201)
async def create_constraint(
    project_id: str,
    body: ConstraintCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new assembly constraint."""
    sb = get_supabase_client()

    if body.type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid constraint type. Must be one of: {', '.join(VALID_TYPES)}")

    # Validate project ownership
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    is_valid, error_msg = _validate_constraint(body.type, body.params)

    cid = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    sb.table("assembly_constraints").insert({
        "id": cid,
        "project_id": project_id,
        "type": body.type,
        "part_a": body.part_a,
        "part_b": body.part_b,
        "params_json": body.params,
        "is_valid": is_valid,
        "error_msg": error_msg,
        "created_at": now,
        "updated_at": now,
    }).execute()

    return {
        "id": cid,
        "project_id": project_id,
        "type": body.type,
        "part_a": body.part_a,
        "part_b": body.part_b,
        "params_json": body.params,
        "is_valid": is_valid,
        "error_msg": error_msg,
    }


@router.patch("/{project_id}/constraints/{constraint_id}")
async def update_constraint(
    project_id: str,
    constraint_id: str,
    body: ConstraintUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Update an existing assembly constraint."""
    sb = get_supabase_client()

    # Verify ownership
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    existing = sb.table("assembly_constraints").select("*").eq("id", constraint_id).eq("project_id", project_id).execute()
    if not existing.data:
        raise HTTPException(404, "Constraint not found")

    updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if body.type is not None:
        if body.type not in VALID_TYPES:
            raise HTTPException(400, f"Invalid constraint type")
        updates["type"] = body.type
    if body.part_a is not None:
        updates["part_a"] = body.part_a
    if body.part_b is not None:
        updates["part_b"] = body.part_b
    if body.params is not None:
        updates["params_json"] = body.params

    # Re-validate
    c_type = updates.get("type", existing.data[0]["type"])
    params = updates.get("params_json", existing.data[0].get("params_json", {}))
    is_valid, error_msg = _validate_constraint(c_type, params if isinstance(params, dict) else {})
    updates["is_valid"] = is_valid
    updates["error_msg"] = error_msg

    res = sb.table("assembly_constraints").update(updates).eq("id", constraint_id).execute()
    return res.data[0] if res.data else {"id": constraint_id, "updated": True}


@router.delete("/{project_id}/constraints/{constraint_id}", status_code=204)
async def delete_constraint(
    project_id: str,
    constraint_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Delete an assembly constraint."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")
    sb.table("assembly_constraints").delete().eq("id", constraint_id).eq("project_id", project_id).execute()


@router.post("/{project_id}/constraints/validate-all")
async def validate_all_constraints(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Re-validate all constraints and check for circular dependencies."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    res = sb.table("assembly_constraints").select("*").eq("project_id", project_id).execute()
    constraints = res.data or []

    # Check for circular dependency (part_a → part_b → ... → part_a)
    graph: dict[str, set] = {}
    for c in constraints:
        a, b = c.get("part_a", ""), c.get("part_b", "")
        if a and b:
            graph.setdefault(a, set()).add(b)

    def has_cycle(node, visited, rec_stack):
        visited.add(node)
        rec_stack.add(node)
        for neighbor in graph.get(node, []):
            if neighbor not in visited:
                if has_cycle(neighbor, visited, rec_stack):
                    return True
            elif neighbor in rec_stack:
                return True
        rec_stack.discard(node)
        return False

    visited: set = set()
    circular = False
    for node in list(graph.keys()):
        if node not in visited:
            if has_cycle(node, visited, set()):
                circular = True
                break

    results = []
    for c in constraints:
        is_valid, error_msg = _validate_constraint(c["type"], c.get("params_json") or {})
        if circular and c.get("part_a") and c.get("part_b"):
            is_valid = False
            error_msg = "Circular constraint dependency detected"
        sb.table("assembly_constraints").update({
            "is_valid": is_valid,
            "error_msg": error_msg,
        }).eq("id", c["id"]).execute()
        results.append({**c, "is_valid": is_valid, "error_msg": error_msg})

    valid_count = sum(1 for r in results if r["is_valid"])
    return {
        "total": len(results),
        "valid": valid_count,
        "invalid": len(results) - valid_count,
        "circular_dependency_detected": circular,
        "constraints": results,
    }
