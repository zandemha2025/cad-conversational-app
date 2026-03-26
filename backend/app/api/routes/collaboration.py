"""
Real-time collaboration: project sharing, comments, and presence.

Tables (run once in Supabase SQL editor):
  CREATE TABLE IF NOT EXISTS project_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    shared_by UUID,
    share_token TEXT UNIQUE NOT NULL,
    permission TEXT DEFAULT 'view',
    email TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS project_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID,
    user_name TEXT,
    user_email TEXT,
    comment TEXT NOT NULL,
    position_json JSONB,
    fixture_version INT,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
  );
"""
from __future__ import annotations

import secrets
import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel

from app.api.deps import get_current_user_id, get_current_user
from app.core.database import get_supabase_client

router = APIRouter(tags=["collaboration"])
log = logging.getLogger(__name__)

SHARES_TABLE = "project_shares"
COMMENTS_TABLE = "project_comments"
PROJECTS_TABLE = "projects"

# ── Table migration (run once at startup) ─────────────────────────────────────

_MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS project_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  shared_by UUID,
  share_token TEXT UNIQUE NOT NULL,
  permission TEXT DEFAULT 'view',
  email TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID,
  user_name TEXT,
  user_email TEXT,
  comment TEXT NOT NULL,
  position_json JSONB,
  fixture_version INT,
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_shares_token ON project_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_project_comments_project ON project_comments(project_id);
"""


async def ensure_collab_tables() -> None:
    """Create collaboration tables if they don't exist. Called at app startup."""
    from app.core.config import settings
    if not settings.DATABASE_URL:
        log.warning("DATABASE_URL not set — collaboration tables must be created manually in Supabase")
        return
    try:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text
        engine = create_async_engine(settings.DATABASE_URL, echo=False)
        # asyncpg cannot execute multiple statements in one call — split them
        statements = [s.strip() for s in _MIGRATION_SQL.split(";") if s.strip()]
        async with engine.begin() as conn:
            for stmt in statements:
                await conn.execute(text(stmt))
        await engine.dispose()
        log.info("Collaboration tables ensured")
    except Exception as exc:
        log.error("Failed to create collaboration tables: %s", exc)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


# ── Request / Response models ─────────────────────────────────────────────────

class ShareRequest(BaseModel):
    permission: str = "view"            # 'view' | 'edit'
    email: Optional[str] = None         # restrict to specific email
    expires_hours: Optional[int] = None # e.g. 72 → expires in 3 days


class ShareResponse(BaseModel):
    id: str
    project_id: str
    share_token: str
    permission: str
    email: Optional[str]
    expires_at: Optional[str]
    created_at: str
    share_url: str


class SharedProjectResponse(BaseModel):
    project_id: str
    project_name: str
    part_number: Optional[str]
    revision: Optional[str]
    status: str
    permission: str
    gltf_url: Optional[str] = None


class CommentCreate(BaseModel):
    comment: str
    position_json: Optional[dict] = None
    fixture_version: Optional[int] = None


class CommentResponse(BaseModel):
    id: str
    project_id: str
    user_id: Optional[str]
    user_name: Optional[str]
    user_email: Optional[str]
    comment: str
    position_json: Optional[dict]
    fixture_version: Optional[int]
    resolved: bool
    created_at: str


class CommentPatch(BaseModel):
    resolved: Optional[bool] = None
    comment: Optional[str] = None


# ── Share endpoints ───────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/share", response_model=ShareResponse, status_code=201)
async def create_share_link(
    project_id: str,
    body: ShareRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a shareable link for the project."""
    sb = get_supabase_client()

    # Verify user owns the project
    proj = sb.table(PROJECTS_TABLE).select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")

    token = secrets.token_urlsafe(24)
    expires_at = None
    if body.expires_hours:
        expires_at = (datetime.now(timezone.utc) + timedelta(hours=body.expires_hours)).isoformat()

    row = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "shared_by": user_id,
        "share_token": token,
        "permission": body.permission if body.permission in ("view", "edit") else "view",
        "email": body.email,
        "expires_at": expires_at,
        "created_at": _now(),
    }
    res = sb.table(SHARES_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create share link")

    share = res.data[0]
    return ShareResponse(
        **{k: share[k] for k in ("id", "project_id", "share_token", "permission", "email", "expires_at", "created_at")},
        share_url=f"/shared/{token}",
    )


@router.get("/projects/{project_id}/shares", response_model=list[ShareResponse])
async def list_shares(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all active share links for a project."""
    sb = get_supabase_client()
    proj = sb.table(PROJECTS_TABLE).select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")

    res = sb.table(SHARES_TABLE).select("*").eq("project_id", project_id).order("created_at", desc=True).execute()
    return [
        ShareResponse(**{k: s[k] for k in ("id", "project_id", "share_token", "permission", "email", "expires_at", "created_at")}, share_url=f"/shared/{s['share_token']}")
        for s in (res.data or [])
    ]


@router.delete("/projects/{project_id}/shares/{share_id}", status_code=204)
async def revoke_share(
    project_id: str,
    share_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    proj = sb.table(PROJECTS_TABLE).select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(status_code=404, detail="Project not found")
    sb.table(SHARES_TABLE).delete().eq("id", share_id).eq("project_id", project_id).execute()


# ── Public shared-view endpoint (no auth required) ────────────────────────────

@router.get("/shared/{share_token}", response_model=SharedProjectResponse)
async def get_shared_project(share_token: str):
    """Validate token and return project data for shared view. No login required."""
    sb = get_supabase_client()

    res = sb.table(SHARES_TABLE).select("*").eq("share_token", share_token).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Share link not found or expired")

    share = res.data[0]

    # Check expiry
    if share.get("expires_at"):
        try:
            exp = datetime.fromisoformat(share["expires_at"].replace("Z", "+00:00"))
            if datetime.now(timezone.utc) > exp:
                raise HTTPException(status_code=410, detail="Share link has expired")
        except ValueError:
            pass

    proj_res = sb.table(PROJECTS_TABLE).select("*").eq("id", share["project_id"]).execute()
    if not proj_res.data:
        raise HTTPException(status_code=404, detail="Project not found")

    project = proj_res.data[0]

    # Try to get latest fixture geometry URL
    gltf_url = None
    try:
        geom_res = (
            sb.table("fixture_geometries")
            .select("gltf_url")
            .eq("project_id", share["project_id"])
            .order("version", desc=True)
            .limit(1)
            .execute()
        )
        if geom_res.data:
            gltf_url = geom_res.data[0].get("gltf_url")
    except Exception:
        pass

    return SharedProjectResponse(
        project_id=project["id"],
        project_name=project.get("name", "Untitled"),
        part_number=project.get("part_number"),
        revision=project.get("revision"),
        status=project.get("status", "draft"),
        permission=share["permission"],
        gltf_url=gltf_url,
    )


# ── Comments endpoints ────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    project_id: str,
    resolved: Optional[bool] = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    query = sb.table(COMMENTS_TABLE).select("*").eq("project_id", project_id)
    if resolved is not None:
        query = query.eq("resolved", resolved)
    res = query.order("created_at", desc=False).execute()
    return [CommentResponse(**row) for row in (res.data or [])]


@router.post("/projects/{project_id}/comments", response_model=CommentResponse, status_code=201)
async def add_comment(
    project_id: str,
    body: CommentCreate,
    payload: dict = Depends(get_current_user),
):
    sb = get_supabase_client()
    user_id = payload.get("sub")

    # Fetch user info from Supabase auth
    user_name = payload.get("user_metadata", {}).get("full_name") or payload.get("email", "Unknown")
    user_email = payload.get("email")

    row = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "user_id": user_id,
        "user_name": user_name,
        "user_email": user_email,
        "comment": body.comment,
        "position_json": body.position_json,
        "fixture_version": body.fixture_version,
        "resolved": False,
        "created_at": _now(),
    }
    res = sb.table(COMMENTS_TABLE).insert(row).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to add comment")
    return CommentResponse(**res.data[0])


@router.patch("/projects/{project_id}/comments/{comment_id}", response_model=CommentResponse)
async def update_comment(
    project_id: str,
    comment_id: str,
    body: CommentPatch,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")

    res = (
        sb.table(COMMENTS_TABLE)
        .update(updates)
        .eq("id", comment_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Comment not found")
    return CommentResponse(**res.data[0])


@router.delete("/projects/{project_id}/comments/{comment_id}", status_code=204)
async def delete_comment(
    project_id: str,
    comment_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    sb.table(COMMENTS_TABLE).delete().eq("id", comment_id).eq("project_id", project_id).eq("user_id", user_id).execute()


# ── Viewers (presence — lightweight REST fallback) ───────────────────────────

@router.get("/projects/{project_id}/viewers")
async def get_viewers(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Returns the count of active viewers. Actual presence is tracked via Supabase Realtime on the frontend."""
    return {"project_id": project_id, "viewer_count": 1, "note": "Use Supabase Realtime for live presence"}
