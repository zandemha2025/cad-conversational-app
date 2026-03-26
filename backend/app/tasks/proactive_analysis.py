"""
Celery task: Proactive AI analysis after fixture generation.
Sends full project context to Gemini and generates top 3 suggestions.
"""
import logging
import json
from app.core.celery_app import celery_app

log = logging.getLogger(__name__)


@celery_app.task(name="proactive_analysis_task", bind=True, max_retries=1)
def proactive_analysis_task(self, project_id: str):
    """Run proactive AI analysis and save suggestions as system messages."""
    import asyncio
    from app.core.database import async_session_factory
    from sqlalchemy import text

    async def _run():
        _factory = async_session_factory()
        if _factory is None:
            log.error("DATABASE_URL not configured — skipping proactive analysis")
            return []
        async with _factory() as db:
            # Fetch project context
            part_result = await db.execute(
                text("SELECT features_json FROM part_geometries WHERE project_id = :pid ORDER BY created_at DESC LIMIT 1"),
                {"pid": project_id},
            )
            part_row = part_result.mappings().first()
            features = part_row["features_json"] if part_row else {}

            tp_result = await db.execute(
                text("SELECT type, label, force_n FROM touchpoints WHERE project_id = :pid"),
                {"pid": project_id},
            )
            touchpoints = [dict(r) for r in tp_result.mappings().all()]

            val_result = await db.execute(
                text("SELECT error_count, warning_count, method FROM validation_results WHERE project_id = :pid ORDER BY ran_at DESC LIMIT 3"),
                {"pid": project_id},
            )
            validation = [dict(r) for r in val_result.mappings().all()]

            # Build context for Gemini
            context = {
                "project_id": project_id,
                "features": {
                    "face_count": features.get("face_count", 0),
                    "hole_count": features.get("hole_count", 0),
                    "detected_holes": features.get("detected_holes", [])[:5],
                    "datum_candidates": features.get("datum_candidates", []),
                    "bounding_box": features.get("bounding_box", {}),
                },
                "touchpoints": touchpoints,
                "validation_summary": validation,
            }

            # Call Gemini
            try:
                from app.services.gemini_service import GeminiService
                gemini = GeminiService()
                suggestions = await gemini.generate_proactive_suggestions(
                    part_features=context.get("features", {}),
                    touchpoints=context.get("touchpoints", []),
                    validation_results=context.get("validation_summary", []),
                    environment={},
                )
            except Exception as e:
                log.warning("Gemini proactive analysis failed: %s", e)
                suggestions = _fallback_suggestions(context)

            # Save as system message
            if suggestions:
                import uuid
                from datetime import datetime, timezone
                msg_id = str(uuid.uuid4())
                now = datetime.now(timezone.utc).isoformat()
                await db.execute(
                    text("""
                        INSERT INTO conversation_messages
                          (id, project_id, role, content, created_at)
                        VALUES (:id, :pid, 'system', :content, :now)
                    """),
                    {
                        "id": msg_id,
                        "pid": project_id,
                        "content": json.dumps({"type": "proactive_suggestions", "suggestions": suggestions}),
                        "now": now,
                    },
                )
                await db.commit()

            return suggestions

    try:
        return asyncio.run(_run())
    except Exception as exc:
        log.error("Proactive analysis failed for project=%s: %s", project_id, exc)
        return []


def _fallback_suggestions(context: dict) -> list:
    """Return fallback suggestions when Gemini is unavailable."""
    suggestions = []
    holes = context.get("features", {}).get("detected_holes", [])
    if holes:
        small_holes = [h for h in holes if h.get("diameter", 10) < 6]
        if small_holes:
            suggestions.append({
                "id": "dfm-small-holes",
                "type": "dfm",
                "severity": "warning",
                "title": "Small holes detected",
                "detail": f"{len(small_holes)} holes are under ⌀6mm — may cause print failure with 0.4mm nozzle",
                "action": "Upsize to ⌀6mm+ or add bushing inserts",
            })
    tps = context.get("touchpoints", [])
    if len(tps) < 6:
        suggestions.append({
            "id": "321-incomplete",
            "type": "321",
            "severity": "warning",
            "title": "3-2-1 scheme may be incomplete",
            "detail": f"Only {len(tps)} touchpoints defined — need at least 6 for full DOF constraint",
            "action": "Add remaining touchpoints in Touchpoints panel",
        })
    return suggestions
