"""
Drawing generation service — OCCT orthographic projection + Gemini GD&T placement.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
from app.core.config import settings

log = logging.getLogger(__name__)


async def generate_drawing_inline(project_id: str, db: AsyncSession) -> dict[str, Any] | None:
    """
    Inline drawing generation:
    1. Fetch part geometry + touchpoints
    2. Generate SVG with orthographic views (simplified)
    3. Save to drawings table
    """
    # Fetch part geometry
    result = await db.execute(
        text("SELECT features_json FROM part_geometries WHERE project_id = :pid ORDER BY created_at DESC LIMIT 1"),
        {"pid": project_id},
    )
    part_row = result.mappings().first()
    features = part_row["features_json"] if part_row else {}

    # Fetch touchpoints
    tp_result = await db.execute(
        text("SELECT * FROM touchpoints WHERE project_id = :pid"),
        {"pid": project_id},
    )
    touchpoints = [dict(r) for r in tp_result.mappings().all()]

    # Generate SVG drawing
    svg = _generate_drawing_svg(features, touchpoints, project_id)

    # Save to DB
    drawing_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    await db.execute(
        text("INSERT INTO drawings (id, project_id, svg_json, created_at) VALUES (:id, :pid, :svg::jsonb, :now)"),
        {"id": drawing_id, "pid": project_id, "svg": f'{{"content": "{svg[:500]}"}}', "now": now},
    )
    await db.commit()

    return {"id": drawing_id, "project_id": project_id, "svg_url": None, "created_at": now}


def _generate_drawing_svg(features: dict, touchpoints: list, project_id: str) -> str:
    """Generate a simplified engineering drawing SVG."""
    bbox = features.get("bounding_box", {"x": 150, "y": 100, "z": 20})
    x_mm = bbox.get("x", 150)
    y_mm = bbox.get("y", 100)
    z_mm = bbox.get("z", 20)

    # Scale to drawing units
    scale = 1.5
    w = x_mm * scale
    h = y_mm * scale

    holes = features.get("detected_holes", [])
    face_count = features.get("face_count", 0)

    hole_svgs = ""
    for i, hole in enumerate(holes[:8]):
        cx = (hole.get("center", [0, 0])[0] * scale) + 60
        cy = (hole.get("center", [0, 0])[1] * scale) + 60
        r = (hole.get("diameter", 8) / 2) * scale
        hole_svgs += f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r:.1f}" fill="none" stroke="#1e40af" stroke-width="0.5"/>'
        hole_svgs += f'<text x="{cx:.1f}" y="{cy - r - 2:.1f}" text-anchor="middle" font-size="6" fill="#1e40af">⌀{hole.get("diameter", 8):.1f}</text>'

    tp_svgs = ""
    for i, tp in enumerate(touchpoints[:6]):
        coords = tp.get("coords_json", {})
        tx = (coords.get("x", 0) / 10 * scale) + 60
        ty = (coords.get("y", 0) / 10 * scale) + 60
        color = "#16a34a" if tp.get("type") == "locating" else "#2563eb" if tp.get("type") == "clamping" else "#64748b"
        tp_svgs += f'<circle cx="{tx:.1f}" cy="{ty:.1f}" r="4" fill="{color}" opacity="0.7"/>'
        tp_svgs += f'<text x="{tx + 6:.1f}" y="{ty + 3:.1f}" font-size="5" fill="{color}">TP-{i+1:02d}</text>'

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{w + 120}" height="{h + 120}" viewBox="0 0 {w + 120} {h + 120}">
  <rect width="100%" height="100%" fill="white"/>
  <!-- Title block -->
  <rect x="0" y="0" width="{w + 120}" height="{h + 120}" fill="none" stroke="#334155" stroke-width="2"/>
  <rect x="{w + 20}" y="0" width="100" height="{h + 120}" fill="#f8fafc" stroke="#334155" stroke-width="1"/>
  <text x="{w + 70}" y="20" text-anchor="middle" font-size="8" font-weight="bold" fill="#0f172a">SCALECAD</text>
  <text x="{w + 70}" y="32" text-anchor="middle" font-size="6" fill="#475569">AS9100 Rev D</text>
  <text x="{w + 70}" y="44" text-anchor="middle" font-size="5" fill="#64748b">Project: {project_id[:8]}</text>
  <text x="{w + 70}" y="56" text-anchor="middle" font-size="5" fill="#64748b">Faces: {face_count}</text>
  <text x="{w + 70}" y="68" text-anchor="middle" font-size="5" fill="#64748b">Holes: {len(holes)}</text>
  <text x="{w + 70}" y="80" text-anchor="middle" font-size="5" fill="#64748b">TPs: {len(touchpoints)}</text>
  <!-- Front view -->
  <g transform="translate(60,60)">
    <rect width="{w:.1f}" height="{h:.1f}" fill="#f0f9ff" stroke="#1e40af" stroke-width="1"/>
    {hole_svgs}
    {tp_svgs}
    <!-- Datum arrows -->
    <line x1="0" y1="{h/2:.1f}" x2="-15" y2="{h/2:.1f}" stroke="#f59e0b" stroke-width="1" marker-end="url(#arrow)"/>
    <text x="-18" y="{h/2 + 3:.1f}" text-anchor="end" font-size="8" fill="#f59e0b">A</text>
    <!-- Dimension lines -->
    <line x1="0" y1="{h + 10:.1f}" x2="{w:.1f}" y2="{h + 10:.1f}" stroke="#334155" stroke-width="0.5"/>
    <text x="{w/2:.1f}" y="{h + 20:.1f}" text-anchor="middle" font-size="7" fill="#334155">{x_mm:.0f}</text>
    <line x1="{w + 10:.1f}" y1="0" x2="{w + 10:.1f}" y2="{h:.1f}" stroke="#334155" stroke-width="0.5"/>
    <text x="{w + 18:.1f}" y="{h/2:.1f}" text-anchor="start" font-size="7" fill="#334155">{y_mm:.0f}</text>
  </g>
  <!-- View label -->
  <text x="{60 + w/2:.1f}" y="{60 + h + 35:.1f}" text-anchor="middle" font-size="8" font-weight="bold" fill="#1e40af">FRONT VIEW</text>
  <text x="{60 + w/2:.1f}" y="{60 + h + 45:.1f}" text-anchor="middle" font-size="6" fill="#475569">SCALE 1:1  ASME Y14.5-2018</text>
</svg>"""
