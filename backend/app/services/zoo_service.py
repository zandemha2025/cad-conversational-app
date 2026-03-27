"""
Zoo.dev CAD kernel service.

Primary: POST /ai/text-to-cad/glb  { "prompt": "..." }
  → Poll /user/text-to-cad/{id}
  → outputs: { "source.glb": "<b64>", ... }
  → Decode + upload GLB to R2

Fallback: stub GLB (minimal base-plate box) when Zoo.dev is unavailable.

File format conversions (synchronous):
  POST /file/conversion/{src_format}/{output_format}
  Content-Type: application/octet-stream
  Body: raw file bytes
  Response: raw converted file bytes

Examples:
  STEP → GLB:  POST /file/conversion/step/glb
  GLB  → STEP: POST /file/conversion/glb/step
  GLB  → STL:  POST /file/conversion/glb/stl
  GLB  → IGES: POST /file/conversion/glb/iges
"""
import asyncio
import base64
import httpx
import json
import logging
import struct
import uuid

from app.core.config import settings
from app.core.storage import upload_gltf, upload_export

log = logging.getLogger(__name__)

TIMEOUT = 120.0    # text-to-cad can take 30–90 s
POLL_INTERVAL = 5
POLL_MAX = 25      # 125 s max polling


def _zoo_url(path: str, **query_params: str) -> tuple[str, dict]:
    """
    Build a Zoo.dev request URL and headers.
    When ZOO_PROXY_URL is set, routes through the Vercel proxy to bypass
    Fly.io blocked IPs. Otherwise calls api.zoo.dev directly.
    Returns (url, extra_headers).
    """
    if settings.ZOO_PROXY_URL:
        params = {"zoo_path": path, **query_params}
        qs = "&".join(f"{k}={v}" for k, v in params.items())
        url = f"{settings.ZOO_PROXY_URL}?{qs}"
        extra = {"x-proxy-key": settings.ZOO_PROXY_KEY} if settings.ZOO_PROXY_KEY else {}
        return url, extra
    base = settings.ZOO_API_URL.rstrip("/")
    if query_params:
        qs = "&".join(f"{k}={v}" for k, v in query_params.items())
        return f"{base}{path}?{qs}", {}
    return f"{base}{path}", {}


# ── direct file format conversion ────────────────────────────────────────────

async def convert_file_format(
    src_bytes: bytes,
    src_format: str,
    output_format: str,
    project_id: str = "",
) -> bytes | None:
    """
    Convert a CAD file via Zoo.dev POST /file/conversion/{src_format}/{output_format}.
    Synchronous Zoo.dev endpoint: body = raw bytes, response = converted file bytes.
    Routed through the Vercel proxy via _zoo_url().
    Returns converted bytes or None on failure.
    """
    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — cannot convert %s→%s", src_format, output_format)
        return None
    path = f"/file/conversion/{src_format}/{output_format}"
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            url, extra_headers = _zoo_url(path)
            headers = {
                "Authorization": f"Bearer {settings.ZOO_API_KEY}",
                "Content-Type": "application/octet-stream",
                **extra_headers,
            }
            resp = await client.post(url, content=src_bytes, headers=headers)
            resp.raise_for_status()
            result = resp.content
            log.info("Zoo.dev %s→%s OK project=%s (%d bytes)",
                     src_format, output_format, project_id, len(result))
            return result
    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d %s→%s project=%s: %s",
                  e.response.status_code, src_format, output_format, project_id,
                  e.response.text[:400])
    except Exception as e:
        log.error("Zoo.dev %s→%s error project=%s: %s", src_format, output_format, project_id, e)
    return None


def convert_file_format_sync(
    src_bytes: bytes,
    src_format: str,
    output_format: str,
    project_id: str = "",
) -> bytes | None:
    """
    Synchronous version of convert_file_format() for use in Celery workers.
    Uses httpx.post() (blocking). Same proxy routing as the async version.
    """
    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — cannot convert %s→%s", src_format, output_format)
        return None
    path = f"/file/conversion/{src_format}/{output_format}"
    url, extra_headers = _zoo_url(path)
    headers = {
        "Authorization": f"Bearer {settings.ZOO_API_KEY}",
        "Content-Type": "application/octet-stream",
        **extra_headers,
    }
    try:
        resp = httpx.post(url, content=src_bytes, headers=headers, timeout=TIMEOUT)
        resp.raise_for_status()
        log.info("Zoo.dev %s→%s OK project=%s (%d bytes)",
                 src_format, output_format, project_id, len(resp.content))
        return resp.content
    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d %s→%s project=%s: %s",
                  e.response.status_code, src_format, output_format, project_id,
                  e.response.text[:400])
    except Exception as e:
        log.error("Zoo.dev %s→%s error project=%s: %s", src_format, output_format, project_id, e)
    return None


# ── stub GLB ─────────────────────────────────────────────────────────────────

def _generate_stub_glb(width_mm: float = 200, depth_mm: float = 150, height_mm: float = 15) -> bytes:
    """Generate a minimal valid GLB representing a base-plate fixture placeholder."""
    w, d, h = width_mm / 1000, depth_mm / 1000, height_mm / 1000
    hw, hd = w / 2, d / 2

    verts: list[float] = [
        -hw, 0, -hd,   hw, 0, -hd,   hw, 0,  hd,  -hw, 0,  hd,
        -hw, h, -hd,   hw, h, -hd,   hw, h,  hd,  -hw, h,  hd,
    ]
    idxs: list[int] = [
        0,2,1, 0,3,2,   4,5,6, 4,6,7,
        0,1,5, 0,5,4,   2,7,6, 2,3,7,
        0,4,7, 0,7,3,   1,2,6, 1,6,5,
    ]

    idx_bytes  = struct.pack(f"<{len(idxs)}H", *idxs)
    vert_bytes = struct.pack(f"<{len(verts)}f", *verts)
    idx_padded = idx_bytes + b"\x00" * ((-len(idx_bytes)) % 4)
    bin_data   = idx_padded + vert_bytes
    bin_len    = len(bin_data)

    gltf_dict = {
        "asset": {"version": "2.0", "generator": "ScaleCAD-stub"},
        "scene": 0,
        "scenes": [{"nodes": [0], "name": "Scene"}],
        "nodes": [{"mesh": 0, "name": "base_plate"}],
        "meshes": [{"name": "base_plate", "primitives": [{"attributes": {"POSITION": 1}, "indices": 0, "material": 0, "mode": 4}]}],
        "materials": [{"name": "aluminum", "pbrMetallicRoughness": {"baseColorFactor": [0.75, 0.75, 0.78, 1.0], "metallicFactor": 0.4, "roughnessFactor": 0.5}, "doubleSided": True}],
        "accessors": [
            {"bufferView": 0, "componentType": 5123, "count": len(idxs), "type": "SCALAR", "max": [7], "min": [0]},
            {"bufferView": 1, "componentType": 5126, "count": 8, "type": "VEC3", "max": [hw, h, hd], "min": [-hw, 0.0, -hd]},
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": len(idx_bytes), "target": 34963},
            {"buffer": 0, "byteOffset": len(idx_padded), "byteLength": len(vert_bytes), "target": 34962},
        ],
        "buffers": [{"byteLength": bin_len}],
    }

    json_bytes  = json.dumps(gltf_dict, separators=(",", ":")).encode("utf-8")
    json_pad    = (-len(json_bytes)) % 4
    json_padded = json_bytes + b" " * json_pad
    json_len    = len(json_padded)
    total_len   = 12 + 8 + json_len + 8 + bin_len

    return (
        struct.pack("<III", 0x46546C67, 2, total_len)
        + struct.pack("<II", json_len, 0x4E4F534A) + json_padded
        + struct.pack("<II", bin_len,  0x004E4942) + bin_data
    )


def _safe_b64decode(s: str) -> bytes | None:
    try:
        padded = s + "=" * (-len(s) % 4)
        return base64.b64decode(padded, validate=False)
    except Exception as e:
        log.error("base64 decode error: %s", e)
        return None


# ── polling ───────────────────────────────────────────────────────────────────

async def _poll_text_to_cad(client: httpx.AsyncClient, op_id: str) -> dict | None:
    for _ in range(POLL_MAX):
        await asyncio.sleep(POLL_INTERVAL)
        try:
            poll_url, extra_headers = _zoo_url(f"/user/text-to-cad/{op_id}")
            headers = {"Authorization": f"Bearer {settings.ZOO_API_KEY}", **extra_headers}
            resp = await client.get(poll_url, headers=headers)
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


# ── primary: text-to-CAD endpoint ────────────────────────────────────────────

async def text_to_cad_gltf(project_id: str, prompt: str, version: int) -> dict:
    """
    Generate fixture GLB via Zoo.dev /ai/text-to-cad/step.
    The /step endpoint returns outputs with source.gltf + source.step;
    source.gltf is then converted to GLB via /file/conversion/gltf/glb.
    Falls back to stub GLB on failure.
    Returns {"gltf_url": str|None, "kcl": str|None}.
    """
    empty = {"gltf_url": None, "kcl": None}

    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — using stub GLB")
        return {**empty, "gltf_url": _upload_stub(project_id, version)}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            # Use /ai/text-to-cad/step — the /glb variant no longer returns outputs
            cad_url, extra_headers = _zoo_url("/ai/text-to-cad/step")
            headers = {"Authorization": f"Bearer {settings.ZOO_API_KEY}", **extra_headers}
            resp = await client.post(
                cad_url,
                json={"prompt": prompt},
                headers=headers,
            )
            resp.raise_for_status()
            job = resp.json()
            op_id = job.get("id")
            if not op_id:
                log.error("Zoo.dev text-to-cad returned no op id: %s", job)
                return {**empty, "gltf_url": _upload_stub(project_id, version)}

            log.info("Zoo.dev text-to-cad submitted op=%s project=%s", op_id, project_id)
            data = await _poll_text_to_cad(client, op_id)
            if not data:
                return {**empty, "gltf_url": _upload_stub(project_id, version)}

            outputs = data.get("outputs") or {}
            kcl_code = data.get("code")

            # Convert source.gltf → GLB; fall back to source.step → GLB
            glb_bytes = None
            gltf_b64 = outputs.get("source.gltf")
            if gltf_b64:
                gltf_bytes = _safe_b64decode(gltf_b64)
                if gltf_bytes:
                    glb_bytes = await convert_file_format(gltf_bytes, "gltf", "glb", project_id)
                    if not glb_bytes:
                        log.warning("Zoo.dev gltf→glb conversion failed op=%s, trying step→glb", op_id)

            if not glb_bytes:
                step_b64 = outputs.get("source.step")
                if step_b64:
                    step_bytes = _safe_b64decode(step_b64)
                    if step_bytes:
                        glb_bytes = await convert_file_format(step_bytes, "step", "glb", project_id)

            if not glb_bytes:
                log.error("Zoo.dev: no GLB produced (outputs=%s) op=%s", list(outputs.keys()), op_id)
                return {"gltf_url": _upload_stub(project_id, version), "kcl": kcl_code}

            filename = f"{project_id}/fixture_v{version}_{uuid.uuid4().hex[:8]}.glb"
            gltf_url = upload_gltf(project_id, filename, glb_bytes)
            log.info("Zoo.dev text-to-cad OK → %s project=%s", gltf_url, project_id)
            return {"gltf_url": gltf_url, "kcl": kcl_code}

    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d text-to-cad project=%s: %s",
                  e.response.status_code, project_id, e.response.text[:400])
    except Exception as e:
        log.error("Zoo.dev text-to-cad error project=%s: %s", project_id, e)

    return {**empty, "gltf_url": _upload_stub(project_id, version)}


def _upload_stub(project_id: str, version: int) -> str | None:
    """Upload a stub GLB and return its URL, or None if upload fails."""
    log.warning("Falling back to stub GLB for project=%s", project_id)
    try:
        stub_bytes = _generate_stub_glb()
        filename   = f"{project_id}/fixture_v{version}_stub_{uuid.uuid4().hex[:8]}.glb"
        url = upload_gltf(project_id, filename, stub_bytes)
        log.info("Stub GLB uploaded → %s", url)
        return url
    except Exception as e:
        log.error("Stub GLB upload failed: %s", e)
        return None


# ── legacy alias ──────────────────────────────────────────────────────────────

async def compile_kcl_to_gltf(project_id: str, kcl_code: str, version: int) -> str | None:
    """Legacy wrapper — kept for backward compatibility."""
    result = await text_to_cad_gltf(project_id, f"Manufacturing fixture (version {version})", version)
    return result.get("gltf_url")


# ── format conversion for exports ─────────────────────────────────────────────

async def compile_kcl_to_format(
    project_id: str,
    kcl_code: str,
    output_format: str,
    glb_url: str | None = None,
) -> bytes | None:
    """
    Convert fixture design to the requested format.

    Fast path (preferred): if glb_url is provided, downloads the existing GLB
    from R2 and converts via Zoo.dev POST /file/conversion/glb/{output_format}.
    No polling required — the conversion endpoint is synchronous.

    Slow fallback: if no GLB URL, submits a text-to-CAD AI job and polls for
    the output file (takes 30–90 s).

    output_format: "step", "stl", "iges", "dxf", "gltf", "glb"
    Returns raw bytes, or None on failure.
    """
    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — cannot convert to %s", output_format)
        return None

    # ── Fast path: GLB → output_format via file conversion endpoint ──────────
    if glb_url:
        try:
            async with httpx.AsyncClient(timeout=60.0) as dl_client:
                glb_resp = await dl_client.get(glb_url)
                glb_resp.raise_for_status()
                glb_bytes = glb_resp.content
            result = await convert_file_format(glb_bytes, "glb", output_format, project_id)
            if result:
                return result
            log.warning("GLB→%s via file conversion failed for project=%s — falling back to text-to-CAD",
                        output_format, project_id)
        except Exception as e:
            log.warning("Failed to download GLB from %s: %s — falling back to text-to-CAD",
                        glb_url, e)

    # ── Slow fallback: text-to-CAD AI job (using /step endpoint which returns outputs) ──
    prompt = f"Manufacturing fixture, export as {output_format}"
    format_key_map = {
        "step":  "source.step",
        "iges":  "source.step",
        "gltf":  "source.gltf",
        "glb":   "source.gltf",  # gltf→glb converted below
        "stl":   "source.step",
    }
    want_key = format_key_map.get(output_format.lower(), "source.step")
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            cad_url, extra_headers = _zoo_url("/ai/text-to-cad/step")
            headers = {"Authorization": f"Bearer {settings.ZOO_API_KEY}", **extra_headers}
            resp = await client.post(
                cad_url,
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

            raw_bytes = _safe_b64decode(b64)
            if not raw_bytes:
                return None

            # For GLB output, convert the GLTF JSON to binary GLB
            if output_format.lower() == "glb" and want_key == "source.gltf":
                result = await convert_file_format(raw_bytes, "gltf", "glb", project_id)
            else:
                result = raw_bytes

            if result:
                log.info("Zoo.dev text-to-CAD→%s OK for project=%s (%d bytes)",
                         output_format, project_id, len(result))
            return result

    except httpx.HTTPStatusError as e:
        log.error("Zoo.dev HTTP %d text-to-CAD→%s project=%s: %s",
                  e.response.status_code, output_format, project_id, e.response.text[:400])
        return None
    except Exception as e:
        log.error("Zoo.dev text-to-CAD→%s error project=%s: %s", output_format, project_id, e)
        return None
