"""
CadQuery geometry engine — local Python CAD kernel for precise parametric parts.

Best for: flat plates with holes, cylinders, L-brackets, simple extrusions.
Falls back to Zoo.dev text-to-CAD if CadQuery is not installed or the script fails.

CadQuery installation note:
  pip install cadquery==2.5.2   (requires Python ≤3.11 for pre-built cadquery-ocp wheels)
  cadquery-ocp is the ~400 MB OCP wheel; install it first with --timeout=600.
  In Fly.io Docker: cadquery-ocp is pre-fetched in Dockerfile before the main install.
"""
import logging
import os
import subprocess
import sys
import tempfile
import uuid

from app.core.storage import upload_gltf

log = logging.getLogger(__name__)

# Max seconds to let a CadQuery script run before killing it
CADQUERY_TIMEOUT_DEFAULT = 60
CADQUERY_TIMEOUT_COMPLEX = 90


def _compute_timeout(script: str) -> int:
    """Estimate timeout based on script complexity."""
    slow_ops = sum(1 for op in ['.loft(', '.sweep(', '.revolve(', '.shell(', '.union(', '.cut(']
                   if op in script)
    if slow_ops >= 3:
        return CADQUERY_TIMEOUT_COMPLEX
    if slow_ops >= 1:
        return 75
    return CADQUERY_TIMEOUT_DEFAULT

# numpy.bool8 was removed in NumPy 1.24.0; CadQuery 2.5.x still references it via OCP.
# Restore the alias in the main process so CadQuery imports succeed.
try:
    import numpy as _np
    if not hasattr(_np, "bool8"):
        _np.bool8 = _np.bool_
    del _np
except Exception:
    pass

# Same shim prepended to every subprocess CadQuery script so it takes effect
# before `import cadquery` runs inside the worker process.
_NUMPY_BOOL8_SHIM = (
    "import numpy as _np\n"
    "if not hasattr(_np, 'bool8'):\n"
    "    _np.bool8 = _np.bool_\n"
    "del _np\n"
)


def is_cadquery_available() -> bool:
    try:
        import numpy as _np  # ensure shim is applied before cadquery import
        if not hasattr(_np, "bool8"):
            _np.bool8 = _np.bool_
        import cadquery  # noqa: F401
        return True
    except (ImportError, AttributeError):
        return False


def execute_cadquery_script(
    cq_script: str,
    project_id: str,
    component_name: str,
    version: int,
) -> dict:
    """
    Execute a CadQuery Python script, export STEP, convert to GLB, upload to R2.
    Returns {"gltf_url": str|None, "step_url": str|None, "engine": "cadquery"|"zoo_fallback"}.

    If CadQuery is not installed or the script fails, falls back to Zoo.dev.
    """
    safe_name = component_name.replace(" ", "_").lower()

    if not is_cadquery_available():
        log.warning("CadQuery not installed — falling back to Zoo.dev for '%s'", component_name)
        return _zoo_fallback(project_id, safe_name, version)

    try:
        with tempfile.TemporaryDirectory() as tmpdir:
            step_path = os.path.join(tmpdir, "output.step")

            # Prepend numpy.bool8 shim + patch the hardcoded export path
            script = _NUMPY_BOOL8_SHIM + cq_script.replace("/tmp/cq_output.step", step_path)
            script_path = os.path.join(tmpdir, "script.py")
            with open(script_path, "w") as f:
                f.write(script)

            timeout = _compute_timeout(script)
            result = subprocess.run(
                [sys.executable, script_path],
                timeout=timeout,
                capture_output=True,
                text=True,
            )

            if result.returncode != 0:
                error_detail = (result.stderr or result.stdout or "unknown error")[:500]
                log.error(
                    "CadQuery script failed for '%s':\n--- stdout ---\n%s\n--- stderr ---\n%s",
                    component_name,
                    result.stdout[:800],
                    result.stderr[:800],
                )
                fallback = _zoo_fallback(project_id, safe_name, version)
                fallback["error"] = error_detail
                return fallback

            if not os.path.exists(step_path) or os.path.getsize(step_path) == 0:
                log.error("CadQuery produced no STEP file for '%s'", component_name)
                fallback = _zoo_fallback(project_id, safe_name, version)
                fallback["error"] = "CadQuery produced no STEP output file"
                return fallback

            with open(step_path, "rb") as f:
                step_bytes = f.read()

            log.info("CadQuery OK for '%s' — %d bytes STEP", component_name, len(step_bytes))

        # Extract bounding box dimensions for the Dims overlay
        dimensions_json = _extract_dimensions(step_bytes, component_name)

        # Upload STEP to R2 (reuse upload_gltf infra with STEP key path)
        step_key = f"{project_id}/{safe_name}_v{version}_{uuid.uuid4().hex[:8]}.step"
        step_url = _upload_step(project_id, step_key, step_bytes)

        # Convert STEP → GLB locally first (trimesh + cadquery), fall back to Zoo.dev API
        glb_bytes = _step_to_glb_local(step_bytes, component_name)

        if not glb_bytes:
            log.info("Local STEP→GLB failed for '%s', trying Zoo.dev API conversion", component_name)
            from app.services.zoo_service import convert_file_format_sync
            glb_bytes = convert_file_format_sync(step_bytes, "step", "glb", project_id)

        if glb_bytes:
            glb_key = f"{safe_name}_v{version}_{uuid.uuid4().hex[:8]}.glb"
            gltf_url = upload_gltf(project_id, glb_key, glb_bytes)
            log.info("CadQuery→GLB OK for '%s' → %s", component_name, gltf_url)
            return {"gltf_url": gltf_url, "step_url": step_url, "engine": "cadquery", "dimensions_json": dimensions_json}
        else:
            log.warning("STEP→GLB conversion failed for '%s'; returning STEP only", component_name)
            return {"gltf_url": None, "step_url": step_url, "engine": "cadquery"}

    except subprocess.TimeoutExpired:
        log.error("CadQuery timed out for '%s'", component_name)
        return _zoo_fallback(project_id, safe_name, version)
    except Exception as exc:
        log.error("CadQuery error for '%s': %s", component_name, exc)
        return _zoo_fallback(project_id, safe_name, version)


def _extract_dimensions(step_bytes: bytes, component_name: str) -> list[dict] | None:
    """Extract bounding box dimensions from STEP bytes for the Dims overlay."""
    try:
        import cadquery as cq
        with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as f:
            f.write(step_bytes)
            step_path = f.name
        try:
            result = cq.importers.importStep(step_path)
            bb = result.val().BoundingBox()
            dims = [
                {"label": "Length (X)", "value_mm": round(bb.xlen, 2), "axis": "X",
                 "start": [bb.xmin, (bb.ymin+bb.ymax)/2, (bb.zmin+bb.zmax)/2],
                 "end": [bb.xmax, (bb.ymin+bb.ymax)/2, (bb.zmin+bb.zmax)/2]},
                {"label": "Width (Y)", "value_mm": round(bb.ylen, 2), "axis": "Y",
                 "start": [(bb.xmin+bb.xmax)/2, bb.ymin, (bb.zmin+bb.zmax)/2],
                 "end": [(bb.xmin+bb.xmax)/2, bb.ymax, (bb.zmin+bb.zmax)/2]},
                {"label": "Height (Z)", "value_mm": round(bb.zlen, 2), "axis": "Z",
                 "start": [(bb.xmin+bb.xmax)/2, (bb.ymin+bb.ymax)/2, bb.zmin],
                 "end": [(bb.xmin+bb.xmax)/2, (bb.ymin+bb.ymax)/2, bb.zmax]},
            ]
            log.info("Extracted dimensions for '%s': %.1f × %.1f × %.1f mm",
                     component_name, bb.xlen, bb.ylen, bb.zlen)
            return dims
        finally:
            try:
                os.unlink(step_path)
            except OSError:
                pass
    except Exception as e:
        log.warning("Dimension extraction failed for '%s': %s", component_name, e)
        return None


def _step_to_glb_local(step_bytes: bytes, component_name: str) -> bytes | None:
    """Convert STEP bytes to GLB locally using CadQuery tessellation + trimesh."""
    try:
        import cadquery as cq
        import trimesh
        import numpy as np
    except ImportError as e:
        log.warning("Local STEP→GLB deps missing (%s)", e)
        return None

    step_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as f:
            f.write(step_bytes)
            step_path = f.name

        result = cq.importers.importStep(step_path)
        shape = result.val()  # Workplane.val() returns the underlying Shape/Compound

        # Try tessellating individual solids first — Compound.tessellate() can
        # return empty when the compound contains multiple solids.
        meshes = []
        solids = shape.Solids() if hasattr(shape, 'Solids') else []
        if solids:
            for solid in solids:
                try:
                    vertices, triangles = solid.tessellate(0.1)
                    if vertices and triangles:
                        verts = np.array([(v.x, v.y, v.z) for v in vertices], dtype=np.float32)
                        faces = np.array(triangles, dtype=np.int32)
                        m = trimesh.Trimesh(vertices=verts, faces=faces)
                        if not m.is_empty:
                            meshes.append(m)
                except Exception as sol_e:
                    log.debug("Tessellate solid failed: %s", sol_e)

        # Fallback: tessellate the whole shape directly
        if not meshes:
            vertices, triangles = shape.tessellate(0.1)
            if vertices and triangles:
                verts = np.array([(v.x, v.y, v.z) for v in vertices], dtype=np.float32)
                faces = np.array(triangles, dtype=np.int32)
                m = trimesh.Trimesh(vertices=verts, faces=faces)
                if not m.is_empty:
                    meshes.append(m)

        if not meshes:
            log.warning("Local STEP→GLB: empty mesh for '%s'", component_name)
            return None

        # Merge all solid meshes into one
        combined = trimesh.util.concatenate(meshes) if len(meshes) > 1 else meshes[0]
        glb_data = combined.export(file_type="glb")
        log.info("Local STEP→GLB OK for '%s' (%d bytes, %d solids)", component_name, len(glb_data), len(meshes))
        return glb_data
    except Exception as e:
        log.warning("Local STEP→GLB failed for '%s': %s", component_name, e)
        return None
    finally:
        if step_path:
            try:
                os.unlink(step_path)
            except OSError:
                pass


def _upload_step(project_id: str, key: str, data: bytes) -> str | None:
    """Upload STEP bytes to R2 under the projects/<id>/step/ prefix."""
    try:
        import boto3
        from botocore.config import Config
        from app.core.config import settings
        if not settings.R2_ACCESS_KEY:
            return None
        client = boto3.client(
            "s3",
            endpoint_url=settings.R2_ENDPOINT_URL
                or f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
            aws_access_key_id=settings.R2_ACCESS_KEY,
            aws_secret_access_key=settings.R2_SECRET_KEY,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )
        full_key = f"projects/{project_id}/step/{key}"
        client.put_object(
            Bucket=settings.R2_BUCKET,
            Key=full_key,
            Body=data,
            ContentType="application/octet-stream",
        )
        return f"{settings.R2_PUBLIC_URL}/{full_key}"
    except Exception as e:
        log.error("STEP upload failed: %s", e)
        return None


def _zoo_fallback(project_id: str, component_name: str, version: int) -> dict:
    """Fall back to Zoo.dev text-to-CAD for this component."""
    log.info("Using Zoo.dev fallback for CadQuery component '%s'", component_name)
    from app.services.zoo_service import text_to_cad_gltf
    import asyncio

    prompt = f"Simple mechanical fixture component: {component_name.replace('_', ' ')}"
    loop = asyncio.new_event_loop()
    try:
        result = loop.run_until_complete(
            text_to_cad_gltf(project_id, prompt, version)
        )
        gltf_url = result.get("gltf_url")
        if not gltf_url:
            raise RuntimeError(f"Zoo.dev returned no URL for '{component_name}'")
        return {
            "gltf_url": gltf_url,
            "step_url": None,
            "engine": "zoo_fallback",
        }
    finally:
        loop.close()
