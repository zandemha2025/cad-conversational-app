"""
Audit log API route.
GET /api/audit?org_id=&limit=
"""
from fastapi import APIRouter, Depends, Query
from app.api.deps import get_current_user
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
async def get_audit_log(
    org_id: str = Query(""),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    try:
        where = "1=1"
        params: dict = {"limit": limit}
        if org_id:
            where += " AND org_id = :org_id"
            params["org_id"] = org_id

        result = await db.execute(
            text(f"SELECT * FROM audit_log WHERE {where} ORDER BY created_at DESC LIMIT :limit"),
            params,
        )
        return [dict(r) for r in result.mappings().all()]
    except Exception as e:
        log.error("audit_log error: %s", e)
        return []
