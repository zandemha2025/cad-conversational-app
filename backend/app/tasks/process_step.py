"""
Celery task: parse uploaded STEP file → convert to GLB → extract features.

Flow:
  1. Download STEP bytes from R2
  2. Zoo.dev: POST /file/conversion/step/glb → upload GLB to R2 (primary)
  3. OCCT: parse features from STEP (optional — skipped if not installed)
  4. OCCT: fallback GLB conversion if Zoo.dev unavailable
  5. Update DB record
  6. Publish Redis event so WebSocket broadcasts to browser
"""
import json
import logging
import httpx
from celery import shared_task
from app.core.celery_app import celery_app
from app.core.config import settings
from app.core.database import get_supabase_client
from app.core.storage import upload_gltf
from app.services.zoo_service import convert_file_format_sync

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

        # ── Primary: Zoo.dev STEP → GLB conversion ────────────────────────────
        gltf_url = None
        glb_bytes = convert_file_format_sync(step_bytes, "step", "glb", project_id=project_id)
        if glb_bytes:
            gltf_url = upload_gltf(project_id, f"{project_id}/part_{geometry_id[:8]}.glb", glb_bytes)
            log.info("Zoo.dev STEP→GLB OK geometry_id=%s gltf_url=%s", geometry_id, gltf_url)
        else:
            log.warning("Zoo.dev STEP→GLB failed for geometry_id=%s — trying OCCT fallback", geometry_id)

        # ── Optional: OCCT feature extraction ────────────────────────────────
        features = None
        try:
            from app.services.occt_service import parse_step_file
            features = parse_step_file(step_bytes)
        except Exception as e:
            log.debug("OCCT feature extraction unavailable: %s", e)

        # ── Fallback: OCCT STEP → GLB (if Zoo.dev failed) ────────────────────
        if not gltf_url:
            try:
                from app.services.occt_service import convert_step_to_gltf
                occt_bytes = convert_step_to_gltf(step_bytes)
                if occt_bytes:
                    gltf_url = upload_gltf(
                        project_id, f"{project_id}/part_{geometry_id[:8]}.gltf", occt_bytes
                    )
                    log.info("OCCT STEP→GLB fallback OK geometry_id=%s", geometry_id)
            except Exception as e:
                log.warning("OCCT fallback also failed for geometry_id=%s: %s", geometry_id, e)

        # ── Update DB ─────────────────────────────────────────────────────────
        status = "ready" if gltf_url else "error"
        sb.table(PART_GEOMETRIES_TABLE).update({
            "features_json": features,
            "gltf_url": gltf_url,
            "processing_status": status,
        }).eq("id", geometry_id).execute()

        # Publish progress event
        _publish_event(project_id, {
            "type": "geometry_ready" if gltf_url else "error",
            "geometry_id": geometry_id,
            "gltf_url": gltf_url,
            "face_count": features.get("face_count") if isinstance(features, dict) else None,
        })

        log.info("STEP processing done geometry_id=%s status=%s", geometry_id, status)
        return {"geometry_id": geometry_id, "status": status}

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
