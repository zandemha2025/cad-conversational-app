"""
Celery task: generate N fixture design variations from a single prompt.

Flow:
  1. Call Gemini Pro to generate N distinct geometry descriptions
  2. For each description (sequentially — Zoo.dev rate limits):
     a. Call Zoo.dev text-to-cad to generate GLB
     b. Save fixture_geometry record with variation_group_id + metadata
     c. Publish progress event
"""
import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from celery import shared_task
from app.core.celery_app import celery_app
from app.core.database import get_supabase_client
from app.services.gemini_service import GeminiService

log = logging.getLogger(__name__)
gemini = GeminiService()


def _run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


def _publish(project_id: str, data: dict):
    try:
        import redis
        from app.core.config import settings
        r = redis.from_url(settings.REDIS_URL)
        r.publish(f"scalecad:gen:{project_id}", json.dumps(data, default=str))
    except Exception as e:
        log.warning("Redis publish failed: %s", e)


def _next_version(sb, project_id: str) -> int:
    res = (
        sb.table("fixture_geometries")
        .select("version")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if res.data:
        return res.data[0]["version"] + 1
    return 1


@celery_app.task(
    name="app.tasks.generate_variations.generate_variations_task",
    bind=True,
    max_retries=0,
)
def generate_variations_task(
    self,
    project_id: str,
    prompt: str,
    num_variations: int,
    variation_parameters: list,
    variation_group_id: str | None = None,
):
    log.info(
        "generate_variations project=%s num=%d params=%s",
        project_id, num_variations, variation_parameters,
    )
    sb = get_supabase_client()
    group_id = variation_group_id or str(uuid.uuid4())

    _publish(project_id, {
        "status": "generating_variations",
        "message": f"Generating {num_variations} variations…",
        "progress": 0.05,
        "variation_group_id": group_id,
    })

    # ── Step 1: Generate variation descriptions via Gemini ─────────────────────
    descriptions = _run_async(
        gemini.generate_variation_descriptions(prompt, num_variations, variation_parameters)
    )
    log.info("Gemini returned %d variation descriptions", len(descriptions))

    _publish(project_id, {
        "status": "generating_variations",
        "message": f"Got {len(descriptions)} designs from AI — generating 3D geometry…",
        "progress": 0.15,
        "variation_group_id": group_id,
    })

    # ── Step 2: Generate GLB for each variation sequentially ───────────────────
    from app.services.zoo_service import text_to_cad_gltf

    variation_ids = []
    for i, desc_item in enumerate(descriptions):
        variation_desc = desc_item.get("description", prompt)
        varied_param   = desc_item.get("varied_parameter", "design")
        varied_value   = desc_item.get("varied_value", f"variant {i+1}")
        label          = desc_item.get("label", f"Variation {i+1}")

        progress = 0.15 + (0.75 * (i / num_variations))
        _publish(project_id, {
            "status": "generating_variations",
            "message": f"Generating variation {i+1}/{num_variations}: {label}…",
            "progress": progress,
            "variation_group_id": group_id,
            "current_variation": i + 1,
        })

        version = _next_version(sb, project_id)
        try:
            zoo_result = _run_async(text_to_cad_gltf(project_id, variation_desc, version))
        except Exception as e:
            log.error("Zoo.dev failed for variation %d: %s", i + 1, e)
            zoo_result = {"gltf_url": None, "kcl": None}

        variation_id = str(uuid.uuid4())
        sb.table("fixture_geometries").insert({
            "id": variation_id,
            "project_id": project_id,
            "version": version,
            "kcl": zoo_result.get("kcl"),
            "gltf_url": zoo_result.get("gltf_url"),
            "generation_prompt": variation_desc,
            "variation_group_id": group_id,
            "variation_index": i,
            "variation_metadata": {
                "varied_parameter": varied_param,
                "varied_value": varied_value,
                "label": label,
                "description": variation_desc,
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }).execute()

        variation_ids.append(variation_id)
        log.info("Variation %d/%d saved id=%s", i + 1, num_variations, variation_id)

    # ── Done ───────────────────────────────────────────────────────────────────
    _publish(project_id, {
        "status": "variations_done",
        "message": f"{len(variation_ids)} variations ready!",
        "progress": 1.0,
        "variation_group_id": group_id,
        "variation_ids": variation_ids,
    })

    log.info(
        "generate_variations done project=%s group=%s count=%d",
        project_id, group_id, len(variation_ids),
    )
    return {"variation_group_id": group_id, "variation_ids": variation_ids}
