"""
Celery task: Generate engineering drawing for a project.
"""
import logging
from app.core.celery_app import celery_app

log = logging.getLogger(__name__)


@celery_app.task(name="generate_drawing_task", bind=True, max_retries=2)
def generate_drawing_task(self, project_id: str):
    """
    Generate engineering drawing:
    1. Fetch project part geometry (OCCT features)
    2. Generate SVG orthographic views
    3. Add AI GD&T callouts via Gemini
    4. Upload SVG to R2
    5. Save to drawings table
    """
    import asyncio
    from app.core.database import async_session_factory
    from app.services.drawing_service import generate_drawing_inline

    async def _run():
        _factory = async_session_factory()
        if _factory is None:
            raise RuntimeError("DATABASE_URL not configured")
        async with _factory() as db:
            result = await generate_drawing_inline(project_id, db)
            return result

    try:
        result = asyncio.run(_run())
        log.info("Drawing generated for project=%s: %s", project_id, result)
        return result
    except Exception as exc:
        log.error("Drawing generation failed for project=%s: %s", project_id, exc)
        raise self.retry(exc=exc, countdown=30)
