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
POLL_MAX = 48      # 240 s max polling (Zoo.dev AI generation averages 90–180 s)
MAX_RETRIES = 2    # retry the full text-to-cad call on transient failure
RETRY_DELAY = 5    # seconds between retries


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
            # Zoo.dev file conversion now returns JSON {outputs: {source.X: b64}}
            ct = resp.headers.get("content-type", "")
            if "json" in ct or resp.content[:1] == b"{":
                body = resp.json()
                outputs = (body.get("outputs") or {})
                out_key = f"source.{output_format}"
                b64 = outputs.get(out_key) or next(iter(outputs.values()), None)
                if not b64:
                    log.error("Zoo.dev %s→%s: no output in response project=%s", src_format, output_format, project_id)
                    return None
                result = _safe_b64decode(b64)
            else:
                result = resp.content
            if result:
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
        ct = resp.headers.get("content-type", "")
        if "json" in ct or resp.content[:1] == b"{":
            body = resp.json()
            outputs = (body.get("outputs") or {})
            out_key = f"source.{output_format}"
            b64 = outputs.get(out_key) or next(iter(outputs.values()), None)
            if not b64:
                log.error("Zoo.dev %s→%s: no output in response project=%s", src_format, output_format, project_id)
                return None
            result = _safe_b64decode(b64)
        else:
            result = resp.content
        if result:
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
        "asset": {"version": "2.0", "generator": "ForgeAI-stub"},
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


def _gltf_to_glb(gltf_bytes: bytes) -> bytes:
    """
    Convert GLTF JSON (with embedded data-URI buffers) to binary GLB format.
    Pure Python — no extra API call required.
    GLB spec: 12-byte header + JSON chunk + optional BIN chunk.
    """
    gltf = json.loads(gltf_bytes)

    # Extract and inline all data-URI buffers into a single binary blob.
    bin_parts: list[bytes] = []
    for buf in gltf.get("buffers", []):
        uri = buf.pop("uri", "")
        if uri.startswith("data:"):
            b64 = uri.split(",", 1)[1]
            raw = base64.b64decode(b64 + "=" * (-len(b64) % 4))
        else:
            raw = b""
        buf["byteLength"] = len(raw)
        bin_parts.append(raw)

    bin_data = b"".join(bin_parts)
    pad4 = (-len(bin_data)) % 4
    bin_padded = bin_data + b"\x00" * pad4

    json_raw = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    json_pad = (-len(json_raw)) % 4
    json_padded = json_raw + b" " * json_pad

    has_bin = len(bin_padded) > 0
    total = 12 + 8 + len(json_padded) + (8 + len(bin_padded) if has_bin else 0)

    result = (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_padded), 0x4E4F534A) + json_padded
    )
    if has_bin:
        result += struct.pack("<II", len(bin_padded), 0x004E4942) + bin_padded
    return result


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

def _enhance_prompt(raw_prompt: str) -> str:
    """
    Enhance a raw user prompt with engineering context so Zoo.dev
    generates a proper manufacturing fixture instead of abstract art.
    """
    # If the prompt already has detailed dimensions / engineering terms, leave it alone
    engineering_keywords = ("mm", "inch", "diameter", "thick", "radius", "bore", "hole",
                            "counterbore", "countersink", "chamfer", "fillet", "thread",
                            "M6", "M8", "M10", "M12", "slot", "keyway")
    has_detail = any(kw in raw_prompt.lower() for kw in engineering_keywords)
    if has_detail:
        return raw_prompt

    return (
        f"{raw_prompt}. "
        "This is a manufacturing fixture component made of 6061-T6 aluminum. "
        "Use precise mechanical dimensions in millimeters. "
        "Include mounting holes and functional features appropriate for CNC workholding."
    )


async def _try_text_to_cad_once(client: httpx.AsyncClient, prompt: str, project_id: str) -> dict | None:
    """
    Single attempt: submit to Zoo.dev text-to-cad and poll for result.
    Returns the completed job data dict, or None on failure.
    """
    cad_url, extra_headers = _zoo_url("/ai/text-to-cad/step")
    headers = {"Authorization": f"Bearer {settings.ZOO_API_KEY}", **extra_headers}
    resp = await client.post(cad_url, json={"prompt": prompt}, headers=headers)
    resp.raise_for_status()
    job = resp.json()
    op_id = job.get("id")
    if not op_id:
        log.error("Zoo.dev text-to-cad returned no op id: %s", job)
        return None

    log.info("Zoo.dev text-to-cad submitted op=%s project=%s", op_id, project_id)
    return await _poll_text_to_cad(client, op_id)


async def _extract_glb(outputs: dict, op_id: str) -> bytes | None:
    """
    Try to get GLB bytes from Zoo.dev outputs dict.
    Tries source.gltf → GLB (pure Python), then source.step → GLB (API conversion).
    """
    glb_bytes = None
    gltf_b64 = outputs.get("source.gltf")
    if gltf_b64:
        gltf_bytes = _safe_b64decode(gltf_b64)
        if gltf_bytes:
            try:
                glb_bytes = _gltf_to_glb(gltf_bytes)
                log.info("Zoo.dev gltf→glb (python) OK op=%s (%d bytes)", op_id, len(glb_bytes))
            except Exception as conv_err:
                log.warning("Zoo.dev gltf→glb python conversion failed op=%s: %s", op_id, conv_err)

    if not glb_bytes:
        step_b64 = outputs.get("source.step")
        if step_b64:
            step_bytes = _safe_b64decode(step_b64)
            if step_bytes:
                try:
                    glb_bytes = await convert_file_format(step_bytes, "step", "glb", "")
                    if glb_bytes:
                        log.info("Zoo.dev step→glb (API) OK op=%s (%d bytes)", op_id, len(glb_bytes))
                except Exception as e:
                    log.warning("STEP→GLB conversion failed op=%s: %s", op_id, e)

    return glb_bytes


async def text_to_cad_gltf(project_id: str, prompt: str, version: int) -> dict:
    """
    Generate fixture GLB via Zoo.dev /ai/text-to-cad/step with retry logic.

    Retries up to MAX_RETRIES times on transient failures (timeouts, 5xx errors).
    Enhances raw prompts with engineering context for better results.
    Returns {"gltf_url": str|None, "kcl": str|None, "is_stub": bool, "error": str|None}.
    """
    empty = {"gltf_url": None, "kcl": None, "is_stub": False, "error": None}

    if not settings.ZOO_API_KEY:
        log.warning("ZOO_API_KEY not set — using stub GLB")
        stub_url = _upload_stub(project_id, version)
        return {**empty, "gltf_url": stub_url, "is_stub": True,
                "error": "ZOO_API_KEY not configured — placeholder model used"}

    enhanced_prompt = _enhance_prompt(prompt)
    last_err = ""

    for attempt in range(MAX_RETRIES + 1):
        if attempt > 0:
            delay = RETRY_DELAY * attempt
            log.info("Zoo.dev retry %d/%d in %ds project=%s", attempt, MAX_RETRIES, delay, project_id)
            await asyncio.sleep(delay)

        try:
            async with httpx.AsyncClient(timeout=TIMEOUT) as client:
                data = await _try_text_to_cad_once(client, enhanced_prompt, project_id)

                if not data:
                    last_err = "Zoo.dev generation timed out or returned no result"
                    log.warning("Zoo.dev attempt %d failed: no data project=%s", attempt + 1, project_id)
                    continue  # retry

                outputs = data.get("outputs") or {}
                kcl_code = data.get("code")
                op_id = data.get("id", "?")

                glb_bytes = await _extract_glb(outputs, op_id)

                if not glb_bytes:
                    last_err = f"Zoo.dev completed but produced no usable geometry (outputs: {list(outputs.keys())})"
                    log.warning("Zoo.dev attempt %d: no GLB from outputs project=%s", attempt + 1, project_id)
                    continue  # retry

                filename = f"fixture_v{version}_{uuid.uuid4().hex[:8]}.glb"
                gltf_url = upload_gltf(project_id, filename, glb_bytes)
                log.info("Zoo.dev text-to-cad OK → %s project=%s (attempt %d)", gltf_url, project_id, attempt + 1)
                return {"gltf_url": gltf_url, "kcl": kcl_code, "is_stub": False, "error": None}

        except httpx.HTTPStatusError as e:
            status = e.response.status_code
            last_err = f"Zoo.dev HTTP {status}: {e.response.text[:200]}"
            log.error("Zoo.dev HTTP %d attempt %d project=%s: %s",
                      status, attempt + 1, project_id, e.response.text[:400])
            # Only retry on server errors (5xx) or rate limits (429)
            if status < 500 and status != 429:
                break  # client error, don't retry

        except (httpx.ConnectTimeout, httpx.ReadTimeout, httpx.ConnectError) as e:
            last_err = f"Zoo.dev connection error: {str(e)[:200]}"
            log.warning("Zoo.dev timeout/connect attempt %d project=%s: %s", attempt + 1, project_id, e)
            # Transient — will retry

        except Exception as e:
            last_err = f"Zoo.dev error: {str(e)[:200]}"
            log.error("Zoo.dev unexpected error attempt %d project=%s: %s", attempt + 1, project_id, e)
            break  # unexpected error, don't retry

    # All retries exhausted — fall back to stub
    log.error("Zoo.dev text-to-cad FAILED after %d attempts project=%s: %s",
              MAX_RETRIES + 1, project_id, last_err)
    stub_url = _upload_stub(project_id, version)
    return {**empty, "gltf_url": stub_url, "is_stub": True, "error": last_err}


def _upload_stub(project_id: str, version: int) -> str | None:
    """Upload a stub GLB and return its URL, or None if upload fails."""
    log.warning("Falling back to stub GLB for project=%s", project_id)
    try:
        stub_bytes = _generate_stub_glb()
        filename   = f"fixture_v{version}_stub_{uuid.uuid4().hex[:8]}.glb"
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
    # Only step/gltf/glb can be reliably obtained from the text-to-cad outputs dict.
    # For stl/iges/dxf, return None so the caller can use stub generators instead of
    # silently returning STEP data with the wrong content type.
    if output_format.lower() not in ("step", "gltf", "glb"):
        log.warning("compile_kcl_to_format: GLB→%s conversion failed and slow path does not support this format — returning None", output_format)
        return None

    prompt = f"Manufacturing fixture, export as {output_format}"
    format_key_map = {
        "step":  "source.step",
        "gltf":  "source.gltf",
        "glb":   "source.gltf",  # gltf→glb converted below
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
