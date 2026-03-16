"""
Celery task: parse uploaded STEP file → extract features → convert to GLTF.

Flow:
  1. Download STEP bytes from R2
  2. OCCT: parse features
  3. OCCT: convert to GLTF → upload to R2
  4. Update DB record
  5. Publish Redis event so WebSocket broadcasts to browser
"""
import json
import logging
import httpx
from celery import shared_task
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import get_supabase_client
from app.core.storage import upload_gltf
from app.services.occt_service import parse_step_file, convert_step_to_gltf

log = logging.getLogger(__name__)

PART_GEOMETRIES_TABLE = "part_geometries"


@celery_app.task(name="app.tasks.process_step.process_step_upload", bind=True, max_retries=2)
def process_step_upload(self, geometry_id: str, project_id: str, step_url: str):
    log.info("Processing STEP geometry_id=%s project=%s", geometry_id, project_id)
    sb = get_supabase_client()

    # Update status → processing
    sb.table(PART_GEOMETRIES_TABLE).update({"processing_status": "processing"}).eq("id", geometry_id).execute()

    try:
        # Download STEP from R2
        resp = httpx.get(step_url, timeout=30)
        resp.raise_for_status()
        step_bytes = resp.content

        # Parse features
        features = parse_step_file(step_bytes)
        if not features:
            raise RuntimeError("OCCT failed to parse STEP file")

        # Convert to GLTF
        gltf_bytes = convert_step_to_gltf(step_bytes)
        gltf_url = None
        if gltf_bytes:
            gltf_url = upload_gltf(project_id, f"{project_id}/part_{geometry_id[:8]}.gltf", gltf_bytes)

        # Update DB
        sb.table(PART_GEOMETRIES_TABLE).update({
            "features_json": features,
            "gltf_url": gltf_url,
            "processing_status": "ready",
        }).eq("id", geometry_id).execute()

        # Publish progress event
        _publish_event(project_id, {
            "type": "geometry_ready",
            "geometry_id": geometry_id,
            "gltf_url": gltf_url,
            "face_count": features.get("face_count"),
        })

        log.info("STEP processing done geometry_id=%s", geometry_id)
        return {"geometry_id": geometry_id, "status": "ready"}

    except Exception as exc:
        log.exception("process_step_upload failed: %s", exc)
        sb.table(PART_GEOMETRIES_TABLE).update({"processing_status": "error"}).eq("id", geometry_id).execute()
        _publish_event(project_id, {"type": "error", "detail": "STEP processing failed"})
        raise self.retry(exc=exc, countdown=5)


def _publish_event(project_id: str, data: dict):
    try:
        import redis
        r = redis.from_url(settings.REDIS_URL)
        r.publish(f"scalecad:gen:{project_id}", json.dumps(data))
    except Exception as e:
        log.warning("Redis publish failed: %s", e)
