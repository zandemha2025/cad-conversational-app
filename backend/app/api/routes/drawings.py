"""
Drawing generation routes.
GET /api/drawings/{project_id}/latest
POST /api/drawings/generate/{project_id}
"""
from fastapi import APIRouter, Depends, BackgroundTasks
from app.api.deps import get_current_user
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/drawings", tags=["drawings"])


@router.get("/{project_id}/latest")
async def get_latest_drawing(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT * FROM drawings WHERE project_id = :pid ORDER BY created_at DESC LIMIT 1"),
        {"pid": project_id},
    )
    row = result.mappings().first()
    if not row:
        return None
    return dict(row)


@router.post("/generate/{project_id}")
async def generate_drawing(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    """Enqueue drawing generation task."""
    try:
        from app.tasks.generate_drawing import generate_drawing_task
        job = generate_drawing_task.delay(project_id)
        return {"job_id": str(job.id), "status": "queued"}
    except Exception as e:
        log.warning("Celery not available, running inline: %s", e)
        # Fallback: run inline
        from app.services.drawing_service import generate_drawing_inline
        result = await generate_drawing_inline(project_id, db)
        return {"job_id": "inline", "status": "done", "drawing": result}
