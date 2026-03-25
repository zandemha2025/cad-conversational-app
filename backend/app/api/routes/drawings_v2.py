"""
Project-scoped drawing generation routes.
POST /api/projects/{id}/drawings/generate  — generate 2D drawings
GET  /api/projects/{id}/drawings           — list drawings
"""
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from datetime import datetime, timezone
import uuid
import json
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["drawings"])


def _generate_orthographic_svg(project_name: str, part_number: str, features: list) -> dict:
    """
    Generate orthographic 2D SVG views (front, top, side) from features.
    Returns a dict with front_view, top_view, side_view SVG strings.
    """
    W, H = 300, 200  # View dimensions in px

    def _svg_header(title: str) -> str:
        return (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}" style="background:#fff;border:1px solid #ccc">'
            f'<text x="10" y="15" font-size="10" fill="#666">{title}</text>'
        )

    def _svg_footer() -> str:
        return "</svg>"

    # Compute bounding box from features
    all_pts = []
    for feat in features[:20]:
        if isinstance(feat, dict):
            c = feat.get("centroid")
            if isinstance(c, (list, tuple)) and len(c) >= 3:
                all_pts.append(c)

    if all_pts:
        min_x = min(p[0] for p in all_pts)
        max_x = max(p[0] for p in all_pts)
        min_y = min(p[1] for p in all_pts)
        max_y = max(p[1] for p in all_pts)
        min_z = min(p[2] for p in all_pts)
        max_z = max(p[2] for p in all_pts)
        # Add some padding
        rx = max(max_x - min_x, 10)
        ry = max(max_y - min_y, 10)
        rz = max(max_z - min_z, 10)
    else:
        min_x, max_x, min_y, max_y, min_z, max_z = 0, 100, 0, 100, 0, 50
        rx, ry, rz = 100, 100, 50

    def world_to_px(wx, wy, w_range, h_range, margin=20):
        """Map world coordinates to SVG pixel coordinates."""
        px_x = margin + (wx - w_range[0]) / max(w_range[1] - w_range[0], 1) * (W - 2 * margin)
        px_y = H - margin - (wy - h_range[0]) / max(h_range[1] - h_range[0], 1) * (H - 2 * margin)
        return px_x, px_y

    # ── Front view (XZ plane) ─────────────────────────────────────────────────
    front = _svg_header(f"FRONT VIEW — {part_number}")
    # Draw part outline (rectangle)
    x1, y1 = world_to_px(min_x, min_z, (min_x, max_x), (min_z, max_z))
    x2, y2 = world_to_px(max_x, max_z, (min_x, max_x), (min_z, max_z))
    front += f'<rect x="{min(x1,x2):.1f}" y="{min(y1,y2):.1f}" width="{abs(x2-x1):.1f}" height="{abs(y2-y1):.1f}" fill="none" stroke="#000" stroke-width="1.5"/>'
    # Dimension annotations
    front += f'<text x="{W/2:.0f}" y="{H-5}" font-size="8" text-anchor="middle" fill="#333">{rx:.1f} mm</text>'
    front += f'<text x="5" y="{H/2:.0f}" font-size="8" fill="#333" transform="rotate(-90,5,{H/2:.0f})">{rz:.1f} mm</text>'
    # Draw feature circles
    for feat in features[:10]:
        if isinstance(feat, dict) and feat.get("type") == "hole":
            c = feat.get("centroid", [])
            r = feat.get("radius", 3)
            if isinstance(c, (list, tuple)) and len(c) >= 3 and isinstance(r, (int, float)):
                px, py = world_to_px(c[0], c[2], (min_x, max_x), (min_z, max_z))
                r_px = r / max(rx, 1) * (W - 40)
                front += f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r_px:.1f}" fill="none" stroke="#444" stroke-width="0.8" stroke-dasharray="3,2"/>'
    front += _svg_footer()

    # ── Top view (XY plane) ───────────────────────────────────────────────────
    top = _svg_header(f"TOP VIEW — {part_number}")
    x1, y1 = world_to_px(min_x, min_y, (min_x, max_x), (min_y, max_y))
    x2, y2 = world_to_px(max_x, max_y, (min_x, max_x), (min_y, max_y))
    top += f'<rect x="{min(x1,x2):.1f}" y="{min(y1,y2):.1f}" width="{abs(x2-x1):.1f}" height="{abs(y2-y1):.1f}" fill="none" stroke="#000" stroke-width="1.5"/>'
    top += f'<text x="{W/2:.0f}" y="{H-5}" font-size="8" text-anchor="middle" fill="#333">{rx:.1f} mm</text>'
    top += f'<text x="5" y="{H/2:.0f}" font-size="8" fill="#333" transform="rotate(-90,5,{H/2:.0f})">{ry:.1f} mm</text>'
    for feat in features[:10]:
        if isinstance(feat, dict) and feat.get("type") == "hole":
            c = feat.get("centroid", [])
            r = feat.get("radius", 3)
            if isinstance(c, (list, tuple)) and len(c) >= 2 and isinstance(r, (int, float)):
                px, py = world_to_px(c[0], c[1], (min_x, max_x), (min_y, max_y))
                r_px = r / max(rx, 1) * (W - 40)
                top += f'<circle cx="{px:.1f}" cy="{py:.1f}" r="{r_px:.1f}" fill="none" stroke="#444" stroke-width="0.8"/>'
    top += _svg_footer()

    # ── Side view (YZ plane) ──────────────────────────────────────────────────
    side = _svg_header(f"SIDE VIEW — {part_number}")
    x1, y1 = world_to_px(min_y, min_z, (min_y, max_y), (min_z, max_z))
    x2, y2 = world_to_px(max_y, max_z, (min_y, max_y), (min_z, max_z))
    side += f'<rect x="{min(x1,x2):.1f}" y="{min(y1,y2):.1f}" width="{abs(x2-x1):.1f}" height="{abs(y2-y1):.1f}" fill="none" stroke="#000" stroke-width="1.5"/>'
    side += f'<text x="{W/2:.0f}" y="{H-5}" font-size="8" text-anchor="middle" fill="#333">{ry:.1f} mm</text>'
    side += _svg_footer()

    return {
        "front_view": front,
        "top_view": top,
        "side_view": side,
        "dimensions": {
            "length_mm": round(rx, 2),
            "width_mm": round(ry, 2),
            "height_mm": round(rz, 2),
        },
        "feature_count": len(features),
    }


@router.post("/{project_id}/drawings/generate")
async def generate_drawings(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate 2D orthographic drawings (front, top, side) from the 3D model.
    Stores the result in the drawings table and returns the SVG data.
    """
    sb = get_supabase_client()

    proj = sb.table("projects").select("*").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    project = proj.data[0]
    project_name = project.get("name", "ScaleCAD Project")
    part_number = project.get("part_number") or "PART-001"

    # Get geometry features
    geom_res = (
        sb.table("part_geometries")
        .select("features_json")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    features = []
    if geom_res.data and geom_res.data[0].get("features_json"):
        fj = geom_res.data[0]["features_json"]
        if isinstance(fj, dict):
            features = fj.get("faces", []) or fj.get("features", []) or []
        elif isinstance(fj, list):
            features = fj

    # Generate SVG views
    svg_data = _generate_orthographic_svg(project_name, part_number, features)

    # Add title block info
    now = datetime.now(timezone.utc)
    svg_data["title_block"] = {
        "project_name": project_name,
        "part_number": part_number,
        "revision": project.get("revision", "A"),
        "gdt_standard": project.get("gdt_standard", "ASME Y14.5-2018"),
        "date": now.strftime("%Y-%m-%d"),
        "drawn_by": "ScaleCAD AI",
        "scale": "1:1",
        "units": "mm",
    }

    # Persist to drawings table
    drawing_id = str(uuid.uuid4())
    sb.table("drawings").insert({
        "id": drawing_id,
        "project_id": project_id,
        "svg_json": svg_data,
        "created_at": now.isoformat(),
    }).execute()

    return {
        "id": drawing_id,
        "project_id": project_id,
        "status": "generated",
        "drawing": svg_data,
    }


@router.get("/{project_id}/drawings")
async def list_drawings(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all drawings for a project."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    res = (
        sb.table("drawings")
        .select("id,project_id,pdf_url,created_at")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []
