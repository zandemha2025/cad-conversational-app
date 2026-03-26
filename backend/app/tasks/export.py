"""
Celery task: export fixture to STEP / STL / 3MF / PDF.
"""
import logging
import uuid
from app.core.celery_app import celery_app
from app.core.database import get_supabase_client
from app.core.storage import upload_export

log = logging.getLogger(__name__)


@celery_app.task(name="app.tasks.export.export_task", bind=True)
def export_task(self, project_id: str, fmt: str):
    log.info("export_task project=%s format=%s", project_id, fmt)
    sb = get_supabase_client()

    # Get latest fixture
    geom = (
        sb.table("fixture_geometries")
        .select("kcl,gltf_url")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if not geom.data:
        raise RuntimeError(f"No fixture geometry for project {project_id}")

    kcl = geom.data[0].get("kcl", "")
    gltf_url = geom.data[0].get("gltf_url", "")

    if fmt == "pdf":
        download_url = _export_pdf(project_id, sb)
    elif fmt in ("step", "stl", "3mf", "iges", "dxf"):
        download_url = _export_via_zoo(project_id, kcl, gltf_url, fmt, sb)
    else:
        raise ValueError(f"Unknown export format: {fmt}")

    return {"project_id": project_id, "format": fmt, "download_url": download_url}


def _export_via_zoo(project_id: str, kcl: str, gltf_url: str, fmt: str, sb) -> str:
    """
    Convert to the requested format via Zoo.dev file conversion API.

    Fast path: if gltf_url is set, downloads the existing GLB from R2 and
    posts it to POST /file/conversion/glb/{fmt} (synchronous, no polling).

    Fallback: if no GLB available, tries OCCT or returns a mock URL.
    """
    import httpx
    from app.core.config import settings
    from app.services.zoo_service import convert_file_format_sync

    if not settings.ZOO_API_KEY:
        mock_url = f"{settings.R2_PUBLIC_URL}/mock/{project_id}/export.{fmt}"
        log.warning("ZOO_API_KEY not set — returning mock URL: %s", mock_url)
        return mock_url

    # ── Fast path: download existing GLB, convert via file conversion API ────
    glb_url = gltf_url
    # Also check part_geometries for a GLB if fixture has none
    if not glb_url:
        try:
            part_row = (
                sb.table("part_geometries")
                .select("gltf_url")
                .eq("project_id", project_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            glb_url = part_row.data[0].get("gltf_url") if part_row.data else None
        except Exception as e:
            log.debug("Could not fetch part_geometries gltf_url: %s", e)

    if glb_url:
        try:
            glb_bytes = httpx.get(glb_url, timeout=30).content
            file_bytes = convert_file_format_sync(glb_bytes, "glb", fmt, project_id=project_id)
            if file_bytes:
                filename = f"{project_id}/export_{uuid.uuid4().hex[:8]}.{fmt}"
                return upload_export(project_id, filename, file_bytes, fmt)
            log.warning("Zoo.dev GLB→%s returned nothing for project=%s", fmt, project_id)
        except Exception as e:
            log.warning("Zoo.dev GLB→%s failed for project=%s: %s — trying OCCT", fmt, project_id, e)

    # ── Fallback: OCCT (DXF/IGES) using original STEP ─────────────────────────
    if fmt in ("dxf", "iges"):
        try:
            from app.services import occt_service
            step_row = (
                sb.table("part_geometries")
                .select("step_file_url")
                .eq("project_id", project_id)
                .order("created_at", desc=True)
                .limit(1)
                .execute()
            )
            step_url = step_row.data[0].get("step_file_url") if step_row.data else None
            if step_url:
                step_bytes = httpx.get(step_url, timeout=30).content
                out_bytes = (
                    occt_service.export_to_dxf(step_bytes)
                    if fmt == "dxf"
                    else occt_service.export_to_iges(step_bytes)
                )
                filename = f"{project_id}/export_{uuid.uuid4().hex[:8]}.{fmt}"
                return upload_export(project_id, filename, out_bytes, fmt)
        except Exception as e:
            log.warning("OCCT %s fallback failed for project=%s: %s", fmt, project_id, e)

    # Last resort: mock URL
    mock_url = f"{settings.R2_PUBLIC_URL}/mock/{project_id}/export.{fmt}"
    log.error("All export paths failed for project=%s format=%s — returning mock URL", project_id, fmt)
    return mock_url


def _export_pdf(project_id: str, sb) -> str:
    """Generate a simple PDF drawing using reportlab."""
    try:
        from reportlab.lib.pagesizes import A3
        from reportlab.pdfgen import canvas as rl_canvas
        import io

        buf = io.BytesIO()
        c = rl_canvas.Canvas(buf, pagesize=A3)
        w, h = A3
        c.setFont("Helvetica-Bold", 16)
        c.drawString(50, h - 80, f"ScaleCAD — Fixture Drawing")
        c.setFont("Helvetica", 10)
        c.drawString(50, h - 110, f"Project: {project_id}")
        c.drawString(50, h - 130, "Generated by ScaleCAD · scalecad.app")
        c.save()
        pdf_bytes = buf.getvalue()

        filename = f"{project_id}/drawing_{uuid.uuid4().hex[:8]}.pdf"
        return upload_export(project_id, filename, pdf_bytes, "pdf")
    except ImportError:
        log.warning("reportlab not installed — returning mock PDF URL")
        from app.core.config import settings
        return f"{settings.R2_PUBLIC_URL}/mock/{project_id}/drawing.pdf"
