"""
Organization management + RBAC routes.
"""
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from datetime import datetime, timezone
import uuid
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.post("")
async def create_org(body: dict, db: AsyncSession = Depends(get_db), user=Depends(get_current_user)):
    org_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        text("INSERT INTO organizations (id, name, itar_restricted, data_residency, created_at) VALUES (:id, :name, :itar, :dr, :now)"),
        {"id": org_id, "name": body["name"], "itar": body.get("itar_restricted", False), "dr": body.get("data_residency", "us"), "now": now},
    )
    # Add creator as admin
    member_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO org_members (id, org_id, user_id, role, invited_at) VALUES (:id, :org, :uid, 'admin', :now)"),
        {"id": member_id, "org": org_id, "uid": str(user.id), "now": now},
    )
    await db.commit()
    return {"id": org_id}


@router.get("/{org_id}")
async def get_org(org_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(text("SELECT * FROM organizations WHERE id = :id"), {"id": org_id})
    row = result.mappings().first()
    if not row:
        raise HTTPException(404, "Organization not found")
    return dict(row)


@router.get("/{org_id}/members")
async def list_members(org_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    result = await db.execute(
        text("SELECT m.*, u.email, u.full_name FROM org_members m LEFT JOIN users u ON u.id = m.user_id WHERE m.org_id = :org ORDER BY m.invited_at"),
        {"org": org_id},
    )
    return [dict(r) for r in result.mappings().all()]


@router.post("/{org_id}/members")
async def invite_member(org_id: str, body: dict, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    """Invite a user by email. For now, looks up user by email."""
    email = body.get("email", "")
    role = body.get("role", "engineer")
    now = datetime.now(timezone.utc).isoformat()
    # Look up user
    user_result = await db.execute(text("SELECT id FROM users WHERE email = :email"), {"email": email})
    user_row = user_result.mappings().first()
    if not user_row:
        raise HTTPException(404, "User not found")
    member_id = str(uuid.uuid4())
    await db.execute(
        text("INSERT INTO org_members (id, org_id, user_id, role, invited_at) VALUES (:id, :org, :uid, :role, :now) ON CONFLICT (org_id, user_id) DO UPDATE SET role = :role"),
        {"id": member_id, "org": org_id, "uid": str(user_row["id"]), "role": role, "now": now},
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{org_id}/members/{user_id}")
async def remove_member(org_id: str, user_id: str, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    await db.execute(text("DELETE FROM org_members WHERE org_id = :org AND user_id = :uid"), {"org": org_id, "uid": user_id})
    await db.commit()
    return {"ok": True}


@router.patch("/{org_id}/members/{user_id}/role")
async def update_member_role(org_id: str, user_id: str, body: dict, db: AsyncSession = Depends(get_db), _user=Depends(get_current_user)):
    await db.execute(
        text("UPDATE org_members SET role = :role WHERE org_id = :org AND user_id = :uid"),
        {"role": body["role"], "org": org_id, "uid": user_id},
    )
    await db.commit()
    return {"ok": True}
