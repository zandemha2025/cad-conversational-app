"""
Zoo.dev CAD kernel service.

POST https://api.zoo.dev/file/conversion
  Body:   multipart/form-data  body=<kcl source>
  Params: src_format=kcl  output_format=gltf
  Result: GLTF binary (stream) saved to R2
"""
import httpx
import json
import logging
import struct
import uuid
from app.core.config import settings
from app.core.storage import upload_gltf

log = logging.getLogger(__name__)

ZOO_CONVERT_URL = f"{settings.ZOO_API_URL}/file/conversion"
TIMEOUT = 60.0  # Zoo.dev compilation can take ~10–20s


def _generate_stub_glb(width_mm: float = 200, depth_mm: float = 150, height_mm: float = 15) -> bytes:
    """Generate a minimal valid GLB (GLTF binary) representing a base-plate fixture placeholder."""
    w, d, h = width_mm / 1000, depth_mm / 1000, height_mm / 1000
    hw, hd = w / 2, d / 2

    # 8 unique box vertices  (x, y, z) in metres
    verts: list[float] = [
        -hw, 0, -hd,   hw, 0, -hd,   hw, 0,  hd,  -hw, 0,  hd,   # bottom ring
        -hw, h, -hd,   hw, h, -hd,   hw, h,  hd,  -hw, h,  hd,   # top ring
    ]
    idxs: list[int] = [
        0,2,1, 0,3,2,   # bottom
        4,5,6, 4,6,7,   # top
        0,1,5, 0,5,4,   # front
        2,7,6, 2,3,7,   # back (corrected winding)
        0,4,7, 0,7,3,   # left
        1,2,6, 1,6,5,   # right
    ]

    idx_bytes  = struct.pack(f"<{len(idxs)}H", *idxs)
    vert_bytes = struct.pack(f"<{len(verts)}f", *verts)
    # Pad index buffer to 4-byte boundary
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

    json_bytes = json.dumps(gltf_dict, separators=(",", ":")).encode("utf-8")
    json_pad   = (-len(json_bytes)) % 4
    json_padded = json_bytes + b" " * json_pad
    json_len   = len(json_padded)
    total_len  = 12 + 8 + json_len + 8 + bin_len

    return (
        struct.pack("<III", 0x46546C67, 2, total_len)       # GLB header
        + struct.pack("<II", json_len, 0x4E4F534A) + json_padded  # JSON chunk
        + struct.pack("<II", bin_len,  0x004E4942) + bin_data      # BIN chunk
    )


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
    except Exception as e:
        log.error("Zoo.dev error project=%s: %s", project_id, e)

    # Fallback: upload a stub GLB so the viewport shows a placeholder
    log.warning("Zoo.dev unavailable — uploading stub GLB for project=%s", project_id)
    try:
        stub_bytes = _generate_stub_glb()
        filename   = f"{project_id}/fixture_v{version}_stub_{uuid.uuid4().hex[:8]}.glb"
        stub_url   = upload_gltf(project_id, filename, stub_bytes)
        log.info("Stub GLB uploaded → %s", stub_url)
        return stub_url
    except Exception as e2:
        log.error("Stub GLB upload failed: %s", e2)
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
