"""
Approval workflow routes.
GET  /api/projects/{id}/approvals         — list approvals
POST /api/projects/{id}/approvals/submit  — submit for approval
POST /api/projects/{id}/approvals/{aid}/approve — approve
POST /api/projects/{id}/approvals/{aid}/reject  — reject with comments
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.api.deps import get_current_user, get_current_user_id
from app.core.database import get_db, get_supabase_client
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone
import uuid
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["approvals"])


class ApprovalSubmit(BaseModel):
    revision_ref: str = ""
    comments: str = ""


class ApprovalReview(BaseModel):
    comments: str = ""


@router.get("/{project_id}/approvals")
async def list_approvals(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all approvals for a project."""
    sb = get_supabase_client()
    res = (
        sb.table("approvals")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


@router.post("/{project_id}/approvals/submit")
async def submit_for_approval(
    project_id: str,
    body: ApprovalSubmit,
    user_id: str = Depends(get_current_user_id),
):
    """Submit a project for approval review."""
    sb = get_supabase_client()

    # Verify project exists and belongs to user
    proj = sb.table("projects").select("id,status").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    approval_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()

    sb.table("approvals").insert({
        "id": approval_id,
        "project_id": project_id,
        "status": "pending",
        "submitted_by": user_id,
        "submitted_at": now,
        "revision_ref": body.revision_ref,
        "comments": body.comments,
        "created_at": now,
    }).execute()

    # Update project approval_status
    sb.table("projects").update({
        "approval_status": "pending",
        "updated_at": now,
    }).eq("id", project_id).execute()

    return {"id": approval_id, "status": "pending", "project_id": project_id}


@router.post("/{project_id}/approvals/{approval_id}/approve")
async def approve_project(
    project_id: str,
    approval_id: str,
    body: ApprovalReview,
    user_id: str = Depends(get_current_user_id),
):
    """Approve a submitted project (reviewer role required)."""
    sb = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()

    # Fetch approval
    appr = sb.table("approvals").select("*").eq("id", approval_id).eq("project_id", project_id).execute()
    if not appr.data:
        raise HTTPException(404, "Approval not found")
    if appr.data[0]["status"] != "pending":
        raise HTTPException(400, f"Approval is already {appr.data[0]['status']}")

    sb.table("approvals").update({
        "status": "approved",
        "reviewed_by": user_id,
        "reviewed_at": now,
        "comments": body.comments,
    }).eq("id", approval_id).execute()

    sb.table("projects").update({
        "approval_status": "approved",
        "updated_at": now,
    }).eq("id", project_id).execute()

    return {"id": approval_id, "status": "approved"}


@router.post("/{project_id}/approvals/{approval_id}/reject")
async def reject_project(
    project_id: str,
    approval_id: str,
    body: ApprovalReview,
    user_id: str = Depends(get_current_user_id),
):
    """Reject a submitted project with comments."""
    sb = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()

    appr = sb.table("approvals").select("*").eq("id", approval_id).eq("project_id", project_id).execute()
    if not appr.data:
        raise HTTPException(404, "Approval not found")
    if appr.data[0]["status"] != "pending":
        raise HTTPException(400, f"Approval is already {appr.data[0]['status']}")

    sb.table("approvals").update({
        "status": "rejected",
        "reviewed_by": user_id,
        "reviewed_at": now,
        "comments": body.comments,
    }).eq("id", approval_id).execute()

    sb.table("projects").update({
        "approval_status": "rejected",
        "updated_at": now,
    }).eq("id", project_id).execute()

    return {"id": approval_id, "status": "rejected", "comments": body.comments}
