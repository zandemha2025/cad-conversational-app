"""
Zoo.dev CAD kernel service.

POST https://api.zoo.dev/file/conversion
  Body:   { src_format: "kcl", output_format: "gltf", body: "<kcl source>" }
  Result: GLTF binary (stream) saved to R2
"""
import httpx
import logging
import uuid
from app.core.config import settings
from app.core.storage import upload_gltf

log = logging.getLogger(__name__)

ZOO_CONVERT_URL = f"{settings.ZOO_API_URL}/file/conversion"
TIMEOUT = 60.0  # Zoo.dev compilation can take ~10–20s


async def compile_kcl_to_gltf(project_id: str, kcl_code: str, version: int) -> str | None:
    """
    Sends KCL source to Zoo.dev, gets back GLTF binary, uploads to R2.
    Returns the public R2 URL, or None on failure.
    """
    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — returning mock GLTF URL")
        return f"{settings.R2_PUBLIC_URL}/mock/{project_id}/fixture_v{version}.gltf"

    headers = {
        "Authorization": f"Bearer {settings.ZOO_API_KEY}",
    }
    params = {
        "src_format": "kcl",
        "output_format": "gltf",
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                ZOO_CONVERT_URL,
                params=params,
                files={"body": ("fixture.kcl", kcl_code.encode("utf-8"), "text/plain")},
                headers=headers,
            )
            resp.raise_for_status()

            # Zoo.dev streams back the binary
            gltf_bytes = resp.content
            if not gltf_bytes:
                log.error("Zoo.dev returned empty response for project=%s", project_id)
                return None

            filename = f"{project_id}/fixture_v{version}_{uuid.uuid4().hex[:8]}.gltf"
            gltf_url = upload_gltf(project_id, filename, gltf_bytes)
            log.info("Zoo.dev compile OK → %s", gltf_url)
            return gltf_url

    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d for project=%s: %s", e.response.status_code, project_id, e.response.text[:200])
        return None
    except Exception as e:
        log.error("Zoo.dev error project=%s: %s", project_id, e)
        return None


async def compile_kcl_to_format(project_id: str, kcl_code: str, output_format: str) -> bytes | None:
    """
    Convert KCL source to the requested format via Zoo.dev.
    Returns raw bytes of the converted file, or None on failure.
    output_format: "step", "stl", "iges", "dxf", etc.
    """
    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — cannot convert KCL to %s", output_format)
        return None

    headers = {
        "Authorization": f"Bearer {settings.ZOO_API_KEY}",
    }
    params = {
        "src_format": "kcl",
        "output_format": output_format,
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                ZOO_CONVERT_URL,
                params=params,
                files={"body": ("fixture.kcl", kcl_code.encode("utf-8"), "text/plain")},
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.content
            if not data:
                log.error("Zoo.dev returned empty %s for project=%s", output_format, project_id)
                return None
            log.info("Zoo.dev KCL→%s OK for project=%s (%d bytes)", output_format, project_id, len(data))
            return data
    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d KCL→%s project=%s: %s", e.response.status_code, output_format, project_id, e.response.text[:200])
        return None
    except Exception as e:
        log.error("Zoo.dev KCL→%s error project=%s: %s", output_format, project_id, e)
        return None
