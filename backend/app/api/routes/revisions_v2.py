"""
Project-scoped revision routes (v2).
GET  /api/projects/{id}/revisions              — list revisions
POST /api/projects/{id}/revisions              — create revision
GET  /api/projects/{id}/revisions/{rev_id}     — get single revision
GET  /api/projects/{id}/revisions/{rev_id}/diff — diff between revisions
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from datetime import datetime, timezone
import uuid
import json
import logging
import difflib

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["revisions"])


class RevisionCreate(BaseModel):
    rev_letter: str = "A"
    description: str = ""
    ecr_number: Optional[str] = None
    changes: list = []


def _serialize_changes(changes: Any) -> str:
    """Serialize changes to a text format for diffing."""
    if isinstance(changes, str):
        return changes
    return json.dumps(changes, indent=2, sort_keys=True)


@router.get("/{project_id}/revisions")
async def list_project_revisions(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all revisions for a project, newest first."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    res = (
        sb.table("revisions")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/{project_id}/revisions", status_code=201)
async def create_project_revision(
    project_id: str,
    body: RevisionCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Create a new revision for a project."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id,name,revision").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    rev_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    sb.table("revisions").insert({
        "id": rev_id,
        "project_id": project_id,
        "rev_letter": body.rev_letter,
        "status": "in-review",
        "ecr_number": body.ecr_number,
        "description": body.description,
        "author_id": user_id,
        "changes_json": body.changes,
        "created_at": now,
    }).execute()

    # Auto-update project revision field
    sb.table("projects").update({
        "revision": body.rev_letter,
        "updated_at": now,
    }).eq("id", project_id).execute()

    return {
        "id": rev_id,
        "project_id": project_id,
        "rev_letter": body.rev_letter,
        "status": "in-review",
        "description": body.description,
        "created_at": now,
    }


@router.get("/{project_id}/revisions/{revision_id}")
async def get_project_revision(
    project_id: str,
    revision_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get a single revision by ID."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    res = (
        sb.table("revisions")
        .select("*")
        .eq("id", revision_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "Revision not found")
    return res.data[0]


@router.get("/{project_id}/revisions/{revision_id}/diff")
async def diff_revision(
    project_id: str,
    revision_id: str,
    compare_to: Optional[str] = None,  # query param: another revision_id to compare against
    user_id: str = Depends(get_current_user_id),
):
    """
    Diff between a revision and either:
    - A specific revision (compare_to query param)
    - The previous revision (if compare_to is omitted)

    Returns a unified diff of the changes_json content.
    """
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    # Fetch all revisions in chronological order
    all_revs = (
        sb.table("revisions")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at")
        .execute()
    )
    revisions = all_revs.data or []

    # Find target revision
    target = next((r for r in revisions if r["id"] == revision_id), None)
    if not target:
        raise HTTPException(404, "Revision not found")

    # Find comparison revision
    if compare_to:
        base = next((r for r in revisions if r["id"] == compare_to), None)
        if not base:
            raise HTTPException(404, f"Comparison revision '{compare_to}' not found")
    else:
        # Use the previous revision
        target_idx = next((i for i, r in enumerate(revisions) if r["id"] == revision_id), None)
        if target_idx is None or target_idx == 0:
            base = None  # No previous revision
        else:
            base = revisions[target_idx - 1]

    # Build text representations for diffing
    target_text = _serialize_changes(target.get("changes_json", []))
    target_lines = target_text.splitlines(keepends=True)

    if base:
        base_text = _serialize_changes(base.get("changes_json", []))
        base_lines = base_text.splitlines(keepends=True)
        from_label = f"Rev {base['rev_letter']} ({base['created_at'][:10]})"
        to_label = f"Rev {target['rev_letter']} ({target['created_at'][:10]})"
    else:
        base_lines = []
        from_label = "(initial)"
        to_label = f"Rev {target['rev_letter']} ({target['created_at'][:10]})"

    unified_diff = list(difflib.unified_diff(
        base_lines,
        target_lines,
        fromfile=from_label,
        tofile=to_label,
        lineterm="",
    ))

    # Field-level comparison
    field_changes = []
    target_fields = {
        "rev_letter": target.get("rev_letter"),
        "status": target.get("status"),
        "description": target.get("description"),
        "ecr_number": target.get("ecr_number"),
    }
    if base:
        base_fields = {
            "rev_letter": base.get("rev_letter"),
            "status": base.get("status"),
            "description": base.get("description"),
            "ecr_number": base.get("ecr_number"),
        }
        for field, new_val in target_fields.items():
            old_val = base_fields.get(field)
            if old_val != new_val:
                field_changes.append({
                    "field": field,
                    "from": old_val,
                    "to": new_val,
                })
    else:
        for field, val in target_fields.items():
            if val:
                field_changes.append({"field": field, "from": None, "to": val})

    return {
        "project_id": project_id,
        "revision_id": revision_id,
        "base_revision_id": base["id"] if base else None,
        "from_label": from_label,
        "to_label": to_label,
        "field_changes": field_changes,
        "changes_diff": "".join(unified_diff) or "(no changes in changes_json)",
        "diff_lines": unified_diff,
        "target": {
            "id": target["id"],
            "rev_letter": target["rev_letter"],
            "status": target["status"],
            "description": target["description"],
            "created_at": target["created_at"],
        },
        "base": {
            "id": base["id"],
            "rev_letter": base["rev_letter"],
            "status": base["status"],
            "description": base["description"],
            "created_at": base["created_at"],
        } if base else None,
    }
