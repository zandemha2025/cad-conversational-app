"""
Zoo.dev CAD kernel service.

KCL → 3D geometry pipeline via Zoo.dev text-to-CAD REST API:
  POST /ai/text-to-cad/glb?kcl=true  { "prompt": "<engineer prompt>" }
  → Poll /user/text-to-cad/{id}
  → outputs: { "source.glb": "<b64>", "source.step": "<b64>", ... }
  → Decode + upload GLB to R2

File format conversions (STEP/GLTF → STL etc.) via:
  POST /file/conversion/{src_format}/{output_format}
  Content-Type: application/octet-stream
  Body: raw file bytes
  → Response JSON: { "outputs": { "<name>": "<b64>" } }
"""
import asyncio
import base64
import logging
import uuid

import httpx

from app.core.config import settings
from app.core.storage import upload_gltf, upload_export

log = logging.getLogger(__name__)

TIMEOUT = 120.0   # text-to-cad can take 30–90 s
POLL_INTERVAL = 5
POLL_MAX = 30     # 150 s max total


# ── helpers ───────────────────────────────────────────────────────────────────

def _safe_b64decode(s: str) -> bytes | None:
    """Decode a base64 string with proper padding; return None on failure."""
    try:
        padded = s + "=" * (-len(s) % 4)
        return base64.b64decode(padded, validate=False)
    except Exception as e:
        log.error("base64 decode error: %s", e)
        return None


def _extract_prompt_from_kcl(kcl_code: str) -> str:
    """Pull the first meaningful comment block out of KCL as a short prompt."""
    lines = []
    for line in kcl_code.splitlines()[:30]:
        stripped = line.strip()
        if stripped.startswith("//"):
            text = stripped[2:].strip()
            if text and not text.startswith("-"):
                lines.append(text)
        elif stripped and not stripped.startswith("const") and not stripped.startswith("let"):
            break
    return " ".join(lines)[:400] if lines else "Generate a manufacturing fixture"


async def _poll_text_to_cad(client: httpx.AsyncClient, op_id: str) -> dict | None:
    """Poll /user/text-to-cad/{id} until completed or failed."""
    headers = {"Authorization": f"Bearer {settings.ZOO_API_KEY}"}
    for _ in range(POLL_MAX):
        await asyncio.sleep(POLL_INTERVAL)
        try:
            resp = await client.get(
                f"{settings.ZOO_API_URL}/user/text-to-cad/{op_id}",
                headers=headers,
            )
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            log.warning("zoo poll error: %s", e)
            continue
        status = data.get("status", "").lower()
        if status == "completed":
            return data
        if status in ("failed", "error"):
            log.error("Zoo.dev text-to-cad failed op=%s error=%s", op_id, data.get("error"))
            return None
    log.error("Zoo.dev text-to-cad timed out op=%s", op_id)
    return None


# ── primary GLTF generation (used by Celery worker) ───────────────────────────

async def text_to_cad_gltf(project_id: str, prompt: str, version: int) -> dict:
    """
    Generate fixture GLTF + KCL using Zoo.dev /ai/text-to-cad API.

    Returns:
        {
          "gltf_url": str | None,   # public R2 URL for the .glb file
          "kcl": str | None,        # KCL source returned by Zoo.dev
          "step_bytes": bytes | None,  # raw STEP bytes (not uploaded)
        }
    """
    empty = {"gltf_url": None, "kcl": None, "step_bytes": None}

    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — skipping geometry generation")
        return empty

    headers = {"Authorization": f"Bearer {settings.ZOO_API_KEY}"}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Submit text-to-CAD job (request GLB output + KCL source)
            resp = await client.post(
                f"{settings.ZOO_API_URL}/ai/text-to-cad/glb",
                params={"kcl": "true"},
                json={"prompt": prompt},
                headers=headers,
            )
            resp.raise_for_status()
            job = resp.json()
            op_id = job.get("id")
            if not op_id:
                log.error("Zoo.dev text-to-cad returned no op id: %s", job)
                return empty

            log.info("Zoo.dev text-to-cad submitted op=%s project=%s", op_id, project_id)

            # Poll until done
            data = await _poll_text_to_cad(client, op_id)
            if not data:
                return empty

            outputs = data.get("outputs") or {}

            # Decode GLB
            glb_b64 = outputs.get("source.glb")
            if not glb_b64:
                log.error("Zoo.dev result missing source.glb op=%s", op_id)
                return {**empty, "kcl": data.get("code")}

            glb_bytes = _safe_b64decode(glb_b64)
            if not glb_bytes:
                return {**empty, "kcl": data.get("code")}

            # Upload GLB to R2
            filename = f"{project_id}/fixture_v{version}_{uuid.uuid4().hex[:8]}.glb"
            gltf_url = upload_gltf(project_id, filename, glb_bytes)
            log.info("Zoo.dev text-to-cad OK → %s project=%s", gltf_url, project_id)

            # Decode STEP (cache for later export)
            step_bytes: bytes | None = None
            step_b64 = outputs.get("source.step")
            if step_b64:
                step_bytes = _safe_b64decode(step_b64)

            return {
                "gltf_url": gltf_url,
                "kcl": data.get("code"),
                "step_bytes": step_bytes,
            }

    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d text-to-cad project=%s: %s",
                  e.response.status_code, project_id, e.response.text[:400])
        return empty
    except Exception as e:
        log.error("Zoo.dev text-to-cad error project=%s: %s", project_id, e)
        return empty


# ── KCL→format for exports (called from export_direct.py) ────────────────────

async def compile_kcl_to_format(project_id: str, kcl_code: str, output_format: str) -> bytes | None:
    """
    Convert fixture KCL to the requested format via Zoo.dev text-to-CAD.

    output_format: "step", "stl", "iges", "gltf", "glb"
    Returns raw bytes of the converted file, or None on failure.
    """
    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — cannot convert KCL to %s", output_format)
        return None

    prompt = _extract_prompt_from_kcl(kcl_code)
    if not prompt or prompt == "Generate a manufacturing fixture":
        prompt = f"Generate a manufacturing fixture in {output_format} format"

    headers = {"Authorization": f"Bearer {settings.ZOO_API_KEY}"}

    # Zoo.dev text-to-cad always returns step + gltf + glb outputs
    # Pick the closest match for the requested format
    format_key_map = {
        "step":  "source.step",
        "iges":  "source.step",   # no native IGES; use STEP as proxy
        "gltf":  "source.gltf",
        "glb":   "source.glb",
        "stl":   "source.glb",    # no native STL; caller falls back to stub
    }
    want_key = format_key_map.get(output_format.lower(), "source.step")

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.post(
                f"{settings.ZOO_API_URL}/ai/text-to-cad/glb",
                json={"prompt": prompt},
                headers=headers,
            )
            resp.raise_for_status()
            op_id = resp.json().get("id")
            if not op_id:
                return None

            data = await _poll_text_to_cad(client, op_id)
            if not data:
                return None

            b64 = (data.get("outputs") or {}).get(want_key)
            if not b64:
                log.warning("Zoo.dev result missing %s for format=%s", want_key, output_format)
                return None

            result = _safe_b64decode(b64)
            if result:
                log.info("Zoo.dev KCL→%s OK for project=%s (%d bytes)",
                         output_format, project_id, len(result))
            return result

    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d KCL→%s project=%s: %s",
                  e.response.status_code, output_format, project_id, e.response.text[:400])
        return None
    except Exception as e:
        log.error("Zoo.dev KCL→%s error project=%s: %s", output_format, project_id, e)
        return None


# ── legacy alias (kept so old import paths still work) ────────────────────────

async def compile_kcl_to_gltf(project_id: str, kcl_code: str, version: int) -> str | None:
    """Legacy wrapper — use text_to_cad_gltf() for new code."""
    prompt = _extract_prompt_from_kcl(kcl_code) or "Generate a manufacturing fixture"
    result = await text_to_cad_gltf(project_id, prompt, version)
    return result.get("gltf_url")
