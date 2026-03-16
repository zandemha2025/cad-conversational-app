"""
ECR / Revision workflow routes.
GET/POST /api/revisions/{project_id}
PATCH /api/revisions/{id}/approve|release|obsolete
"""
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone
import uuid
import json
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/revisions", tags=["revisions"])


@router.get("/{project_id}")
async def list_revisions(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT * FROM revisions WHERE project_id = :pid ORDER BY created_at DESC"),
        {"pid": project_id},
    )
    return [dict(r) for r in result.mappings().all()]


@router.post("")
async def create_revision(
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    rev_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        text("""
            INSERT INTO revisions
              (id, project_id, rev_letter, status, ecr_number, description, author_id, changes_json, created_at)
            VALUES
              (:id, :pid, :rev, :status, :ecr, :desc, :author, :changes::jsonb, :now)
        """),
        {
            "id": rev_id,
            "pid": body["project_id"],
            "rev": body.get("rev_letter", "A"),
            "status": "in-review",
            "ecr": body.get("ecr_number"),
            "desc": body.get("description", ""),
            "author": str(user.id),
            "changes": json.dumps(body.get("changes", [])),
            "now": now,
        },
    )
    await db.commit()
    return {"id": rev_id, "status": "in-review"}


@router.patch("/{revision_id}/approve")
async def approve_revision(
    revision_id: str,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        text("UPDATE revisions SET approved_by = :uid, approved_at = :now WHERE id = :id"),
        {"uid": str(user.id), "now": now, "id": revision_id},
    )
    await db.commit()
    return {"ok": True}


@router.patch("/{revision_id}/release")
async def release_revision(
    revision_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await db.execute(
        text("UPDATE revisions SET status = 'released' WHERE id = :id"),
        {"id": revision_id},
    )
    await db.commit()
    return {"ok": True}


@router.patch("/{revision_id}/obsolete")
async def obsolete_revision(
    revision_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    await db.execute(
        text("UPDATE revisions SET status = 'obsolete' WHERE id = :id"),
        {"id": revision_id},
    )
    await db.commit()
    return {"ok": True}
