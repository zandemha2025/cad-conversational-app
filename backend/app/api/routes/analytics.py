"""
Analytics routes.
GET /api/analytics/validation-trends
GET /api/analytics/dfm-frequency
GET /api/analytics/release-velocity
"""
from fastapi import APIRouter, Depends, Query
from app.api.deps import get_current_user, get_current_user_id
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/validation-trends")
async def validation_trends(
    project_id: str = Query("", description="Optional project filter"),
    days: int = Query(30, le=90),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Validation error/warning trend over time."""
    # days is FastAPI-validated int le=90, safe to embed directly
    where = f"WHERE vr.ran_at >= NOW() - INTERVAL '{days} days'"
    params: dict = {"uid": user_id}
    if project_id:
        where += " AND vr.project_id = :pid"
        params["pid"] = project_id

    result = await db.execute(
        text(f"""
            SELECT DATE(vr.ran_at) as date,
                   SUM(vr.error_count)   as error_count,
                   SUM(vr.warning_count) as warning_count,
                   ROUND(
                     AVG(GREATEST(0, 100.0 - vr.error_count * 5 - vr.warning_count * 2)),
                     1
                   ) as score
            FROM validation_results vr
            JOIN projects p ON p.id = vr.project_id
            {where}
              AND p.user_id = :uid
            GROUP BY DATE(vr.ran_at)
            ORDER BY date
        """),
        params,
    )
    return [dict(r) for r in result.mappings().all()]


@router.get("/dfm-frequency")
async def dfm_frequency(
    days: int = Query(90, le=365),
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Most common DFM issue titles across all projects for this user."""
    result = await db.execute(
        text(f"""
            SELECT
                issue->>'title'    AS rule,
                issue->>'severity' AS severity,
                COUNT(*)           AS count
            FROM validation_results vr
            JOIN projects p ON p.id = vr.project_id,
            jsonb_array_elements(vr.issues_json) AS issue
            WHERE p.user_id = :uid
              AND vr.ran_at >= NOW() - INTERVAL '{days} days'
            GROUP BY rule, severity
            ORDER BY count DESC
            LIMIT 20
        """),
        {"uid": user_id},
    )
    return [dict(r) for r in result.mappings().all()]


@router.get("/release-velocity")
async def release_velocity(
    db: AsyncSession = Depends(get_db),
    user_id: str = Depends(get_current_user_id),
):
    """Avg days from project creation to release, grouped by template."""
    result = await db.execute(
        text("""
            SELECT
                COALESCE(template_id, 'custom') AS category,
                ROUND(
                  AVG(
                    EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400.0
                  )::numeric,
                  1
                ) AS avg_days,
                COUNT(*) AS count
            FROM projects
            WHERE user_id  = :uid
              AND status   = 'released'
            GROUP BY template_id
            ORDER BY count DESC
        """),
        {"uid": user_id},
    )
    return [dict(r) for r in result.mappings().all()]
