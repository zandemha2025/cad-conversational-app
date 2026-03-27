"""
Celery task: Proactive AI analysis after fixture generation.
Sends full project context to Gemini and generates top 3 suggestions.
"""
import logging
import json
import uuid
from datetime import datetime, timezone
from app.core.celery_app import celery_app

log = logging.getLogger(__name__)


@celery_app.task(name="proactive_analysis_task", bind=True, max_retries=1)
def proactive_analysis_task(self, project_id: str):
    """Run proactive AI analysis and save suggestions as system messages."""
    from app.core.database import get_supabase_client

    sb = get_supabase_client()

    # Fetch project context via Supabase SDK
    part_result = (
        sb.table("part_geometries")
        .select("features_json")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    features = {}
    if part_result.data:
        features = part_result.data[0].get("features_json") or {}

    tp_result = (
        sb.table("touchpoints")
        .select("type,label,force_n")
        .eq("project_id", project_id)
        .execute()
    )
    touchpoints = tp_result.data or []

    val_result = (
        sb.table("validation_results")
        .select("error_count,warning_count,method")
        .eq("project_id", project_id)
        .order("ran_at", desc=True)
        .limit(3)
        .execute()
    )
    validation = val_result.data or []

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
        import asyncio
        from app.services.gemini_service import GeminiService
        gemini = GeminiService()

        loop = asyncio.new_event_loop()
        try:
            suggestions = loop.run_until_complete(gemini.generate_proactive_suggestions(
                part_features=context.get("features", {}),
                touchpoints=context.get("touchpoints", []),
                validation_results=context.get("validation_summary", []),
                environment={},
            ))
        finally:
            loop.close()
    except Exception as e:
        log.warning("Gemini proactive analysis failed: %s", e)
        suggestions = _fallback_suggestions(context)

    # Save as system message
    if suggestions:
        msg_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        try:
            sb.table("conversation_messages").insert({
                "id": msg_id,
                "project_id": project_id,
                "role": "system",
                "content": json.dumps({"type": "proactive_suggestions", "suggestions": suggestions}),
                "created_at": now,
            }).execute()
        except Exception as e:
            log.warning("Failed to save proactive suggestions: %s", e)

    return suggestions


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
