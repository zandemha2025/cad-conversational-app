"""
Drawing generation service — OCCT Hidden Line Removal orthographic projections.

Generates real front/top/side SVG views from STEP files using pythonocc HLR.
Falls back to bounding-box stubs when OCCT is not available.
"""
import logging
import math
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Try importing OCCT HLR modules
# ---------------------------------------------------------------------------
try:
    from OCC.Core.STEPControl import STEPControl_Reader
    from OCC.Core.IFSelect import IFSelect_RetDone
    from OCC.Core.HLRBRep import HLRBRep_Algo, HLRBRep_HLRToShape
    from OCC.Core.HLRAlgo import HLRAlgo_Projector
    from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
    from OCC.Core.gp import gp_Ax2, gp_Dir, gp_Pnt
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopAbs import TopAbs_EDGE
    from OCC.Core.BRep import BRep_Tool
    from OCC.Core.BRepAdaptor import BRepAdaptor_Curve
    from OCC.Core.GCPnts import GCPnts_UniformAbscissa
    from OCC.Core.BRepBndLib import brepbndlib_Add
    from OCC.Core.Bnd import Bnd_Box
    from OCC.Core.BRepTools import breptools_OuterWire
    from OCC.Core.TopoDS import topods_Edge

    HLR_AVAILABLE = True
    log.info("OCCT HLR modules loaded OK")
except ImportError as exc:
    HLR_AVAILABLE = False
    log.warning("OCCT HLR not available (%s) — drawing service will use stubs", exc)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def generate_orthographic_svgs(step_bytes: bytes) -> dict[str, Any]:
    """
    Generate front, top, side SVG views from a STEP file using OCCT HLR.

    Returns:
        {
            "front_view": "<svg>...",
            "top_view":   "<svg>...",
            "side_view":  "<svg>...",
            "dimensions": {"length_mm": ..., "width_mm": ..., "height_mm": ...},
        }
    """
    if not HLR_AVAILABLE:
        log.warning("HLR unavailable — returning stub SVGs")
        return _stub_svgs()

    # Write bytes to temp file (OCCT STEPControl_Reader needs a path)
    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp:
        tmp.write(step_bytes)
        tmp_path = tmp.name

    try:
        shape = _load_step_shape(tmp_path)
        if shape is None:
            log.error("Failed to load STEP shape — returning stubs")
            return _stub_svgs()

        # Get bounding box for dimensions
        bbox = Bnd_Box()
        brepbndlib_Add(shape, bbox)
        xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()

        dims = {
            "length_mm": round(xmax - xmin, 2),
            "width_mm": round(ymax - ymin, 2),
            "height_mm": round(zmax - zmin, 2),
        }

        # Mesh the shape for HLR (linear deflection proportional to size)
        max_dim = max(dims["length_mm"], dims["width_mm"], dims["height_mm"], 1.0)
        deflection = max_dim * 0.002  # 0.2% of max dimension
        BRepMesh_IncrementalMesh(shape, deflection)

        # Centre of the bounding box — used as the focus point
        cx = (xmin + xmax) / 2.0
        cy = (ymin + ymax) / 2.0
        cz = (zmin + zmax) / 2.0

        # Define view directions (eye direction, up direction)
        views = {
            "front_view": {
                "eye": gp_Dir(0, -1, 0),   # looking along -Y
                "up": gp_Dir(0, 0, 1),      # Z is up
                "label": "FRONT VIEW",
                "h_axis": "X",
                "v_axis": "Z",
                "h_dim": dims["length_mm"],
                "v_dim": dims["height_mm"],
            },
            "top_view": {
                "eye": gp_Dir(0, 0, -1),    # looking along -Z (down)
                "up": gp_Dir(0, 1, 0),       # Y is up
                "label": "TOP VIEW",
                "h_axis": "X",
                "v_axis": "Y",
                "h_dim": dims["length_mm"],
                "v_dim": dims["width_mm"],
            },
            "side_view": {
                "eye": gp_Dir(1, 0, 0),     # looking along +X
                "up": gp_Dir(0, 0, 1),       # Z is up
                "label": "RIGHT SIDE VIEW",
                "h_axis": "Y",
                "v_axis": "Z",
                "h_dim": dims["width_mm"],
                "v_dim": dims["height_mm"],
            },
        }

        result = {"dimensions": dims}

        for view_key, view_cfg in views.items():
            try:
                visible_edges, hidden_edges = _run_hlr(
                    shape, gp_Pnt(cx, cy, cz),
                    view_cfg["eye"], view_cfg["up"],
                )
                svg = _edges_to_svg(
                    visible_edges, hidden_edges,
                    view_cfg["label"],
                    view_cfg["h_dim"], view_cfg["v_dim"],
                )
                result[view_key] = svg
            except Exception as exc:
                log.exception("HLR failed for %s: %s", view_key, exc)
                result[view_key] = _fallback_view_svg(
                    view_cfg["label"],
                    view_cfg["h_dim"],
                    view_cfg["v_dim"],
                )

        return result

    except Exception as exc:
        log.exception("generate_orthographic_svgs failed: %s", exc)
        return _stub_svgs()
    finally:
        Path(tmp_path).unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# HLR projection
# ---------------------------------------------------------------------------

def _load_step_shape(path: str):
    """Load a STEP file and return the combined shape."""
    reader = STEPControl_Reader()
    status = reader.ReadFile(path)
    if status != IFSelect_RetDone:
        log.error("STEP read failed with status %s for %s", status, path)
        return None
    reader.TransferRoots()
    return reader.OneShape()


def _run_hlr(shape, focus: "gp_Pnt", eye_dir: "gp_Dir", up_dir: "gp_Dir"):
    """
    Run Hidden Line Removal on *shape* from the given viewpoint.

    Returns (visible_segments, hidden_segments) where each is a list of
    [(x1,y1), (x2,y2), ...] polylines in 2-D projection space.
    """
    # Create the projector (parallel / orthographic projection)
    ax2 = gp_Ax2(focus, eye_dir, up_dir)
    projector = HLRAlgo_Projector(ax2)

    hlr = HLRBRep_Algo()
    hlr.Add(shape)
    hlr.Projector(projector)
    hlr.Update()
    hlr.Hide()

    hlr_to_shape = HLRBRep_HLRToShape(hlr)

    # Extract visible sharp + smooth + outline edges
    visible_compound = hlr_to_shape.VCompound()
    visible_out_line = hlr_to_shape.OutLineVCompound()
    hidden_compound = hlr_to_shape.HCompound()

    visible_segments = []
    for compound in (visible_compound, visible_out_line):
        if compound is not None and not compound.IsNull():
            visible_segments.extend(_extract_edge_polylines(compound))

    hidden_segments = []
    if hidden_compound is not None and not hidden_compound.IsNull():
        hidden_segments.extend(_extract_edge_polylines(hidden_compound))

    return visible_segments, hidden_segments


def _extract_edge_polylines(compound) -> list[list[tuple[float, float]]]:
    """
    Walk every edge in *compound* and return a list of polylines.
    Each polyline is [(x, y), ...].
    """
    polylines = []
    explorer = TopExp_Explorer(compound, TopAbs_EDGE)
    while explorer.More():
        edge = topods_Edge(explorer.Current())
        pts = _sample_edge(edge)
        if pts:
            polylines.append(pts)
        explorer.Next()
    return polylines


def _sample_edge(edge, n_points: int = 20) -> list[tuple[float, float]]:
    """Sample *n_points* along an edge, returning 2-D (x, y) tuples."""
    try:
        adaptor = BRepAdaptor_Curve(edge)
        first = adaptor.FirstParameter()
        last = adaptor.LastParameter()
        if abs(last - first) < 1e-10:
            return []
        sampler = GCPnts_UniformAbscissa(adaptor, n_points, first, last)
        pts = []
        for i in range(1, sampler.NbPoints() + 1):
            p = adaptor.Value(sampler.Parameter(i))
            pts.append((p.X(), p.Y()))
        return pts
    except Exception:
        return []


# ---------------------------------------------------------------------------
# SVG rendering
# ---------------------------------------------------------------------------

_SVG_WIDTH = 500
_SVG_HEIGHT = 400
_MARGIN = 50


def _edges_to_svg(
    visible: list[list[tuple[float, float]]],
    hidden: list[list[tuple[float, float]]],
    title: str,
    h_dim_mm: float,
    v_dim_mm: float,
) -> str:
    """
    Render edge polylines into an SVG string with a title block,
    border, visible (solid) and hidden (dashed) lines.
    """
    # Compute the bounding box of all points
    all_pts = [pt for seg in (visible + hidden) for pt in seg]
    if not all_pts:
        return _fallback_view_svg(title, h_dim_mm, v_dim_mm)

    xs = [p[0] for p in all_pts]
    ys = [p[1] for p in all_pts]
    pmin_x, pmax_x = min(xs), max(xs)
    pmin_y, pmax_y = min(ys), max(ys)

    data_w = pmax_x - pmin_x or 1.0
    data_h = pmax_y - pmin_y or 1.0

    draw_w = _SVG_WIDTH - 2 * _MARGIN
    draw_h = _SVG_HEIGHT - 2 * _MARGIN - 40  # reserve space for title

    scale = min(draw_w / data_w, draw_h / data_h) * 0.90

    # Centering offsets
    off_x = _MARGIN + (draw_w - data_w * scale) / 2.0
    off_y = _MARGIN + (draw_h - data_h * scale) / 2.0

    def tx(x: float) -> float:
        return off_x + (x - pmin_x) * scale

    def ty(y: float) -> float:
        # Flip Y so that positive is up
        return off_y + (pmax_y - y) * scale

    lines = [
        f'<svg xmlns="http://www.w3.org/2000/svg" '
        f'width="{_SVG_WIDTH}" height="{_SVG_HEIGHT}" '
        f'viewBox="0 0 {_SVG_WIDTH} {_SVG_HEIGHT}" '
        f'style="background:#fff">',

        # Border
        f'<rect x="1" y="1" width="{_SVG_WIDTH - 2}" height="{_SVG_HEIGHT - 2}" '
        f'fill="none" stroke="#334155" stroke-width="1.5"/>',

        # Title block (bottom)
        f'<rect x="1" y="{_SVG_HEIGHT - 38}" width="{_SVG_WIDTH - 2}" height="37" '
        f'fill="#f8fafc" stroke="#334155" stroke-width="0.75"/>',
        f'<text x="{_SVG_WIDTH / 2}" y="{_SVG_HEIGHT - 22}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="11" font-weight="bold" '
        f'fill="#0f172a">{title}</text>',
        f'<text x="{_SVG_WIDTH / 2}" y="{_SVG_HEIGHT - 8}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="8" fill="#64748b">'
        f'SCALE: FIT  |  ASME Y14.5-2018  |  DIMS: '
        f'{h_dim_mm:.1f} x {v_dim_mm:.1f} mm</text>',
    ]

    # Visible edges — solid lines
    for seg in visible:
        if len(seg) < 2:
            continue
        d = "M" + " L".join(f"{tx(p[0]):.2f},{ty(p[1]):.2f}" for p in seg)
        lines.append(
            f'<path d="{d}" fill="none" stroke="#1e293b" stroke-width="1.2" '
            f'stroke-linecap="round" stroke-linejoin="round"/>'
        )

    # Hidden edges — dashed lines
    for seg in hidden:
        if len(seg) < 2:
            continue
        d = "M" + " L".join(f"{tx(p[0]):.2f},{ty(p[1]):.2f}" for p in seg)
        lines.append(
            f'<path d="{d}" fill="none" stroke="#94a3b8" stroke-width="0.6" '
            f'stroke-dasharray="6,3" stroke-linecap="round"/>'
        )

    # Dimension annotations — horizontal
    dim_y = off_y + data_h * scale + 18
    lines.append(
        f'<line x1="{tx(pmin_x):.1f}" y1="{dim_y:.1f}" '
        f'x2="{tx(pmax_x):.1f}" y2="{dim_y:.1f}" '
        f'stroke="#475569" stroke-width="0.5" '
        f'marker-start="url(#arrowL)" marker-end="url(#arrowR)"/>'
    )
    lines.append(
        f'<text x="{(tx(pmin_x) + tx(pmax_x)) / 2:.1f}" y="{dim_y + 12:.1f}" '
        f'text-anchor="middle" font-family="Arial,sans-serif" font-size="9" '
        f'fill="#334155">{h_dim_mm:.1f}</text>'
    )

    # Dimension annotations — vertical
    dim_x = off_x - 18
    lines.append(
        f'<line x1="{dim_x:.1f}" y1="{ty(pmax_y):.1f}" '
        f'x2="{dim_x:.1f}" y2="{ty(pmin_y):.1f}" '
        f'stroke="#475569" stroke-width="0.5"/>'
    )
    lines.append(
        f'<text x="{dim_x - 4:.1f}" y="{(ty(pmax_y) + ty(pmin_y)) / 2:.1f}" '
        f'text-anchor="middle" font-family="Arial,sans-serif" font-size="9" '
        f'fill="#334155" transform="rotate(-90,{dim_x - 4:.1f},'
        f'{(ty(pmax_y) + ty(pmin_y)) / 2:.1f})">{v_dim_mm:.1f}</text>'
    )

    # Arrow marker defs
    lines.append(
        '<defs>'
        '<marker id="arrowR" markerWidth="6" markerHeight="4" '
        'refX="6" refY="2" orient="auto">'
        '<path d="M0,0 L6,2 L0,4" fill="#475569"/></marker>'
        '<marker id="arrowL" markerWidth="6" markerHeight="4" '
        'refX="0" refY="2" orient="auto">'
        '<path d="M6,0 L0,2 L6,4" fill="#475569"/></marker>'
        '</defs>'
    )

    lines.append('</svg>')
    return "\n".join(lines)


def _fallback_view_svg(title: str, h_dim: float, v_dim: float) -> str:
    """Minimal rectangle-based fallback when HLR fails for a single view."""
    W, H = _SVG_WIDTH, _SVG_HEIGHT
    margin = _MARGIN
    rect_w = W - 2 * margin
    rect_h = H - 2 * margin - 40

    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
        f'viewBox="0 0 {W} {H}" style="background:#fff">'
        f'<rect x="1" y="1" width="{W-2}" height="{H-2}" fill="none" '
        f'stroke="#334155" stroke-width="1.5"/>'
        f'<rect x="{margin}" y="{margin}" width="{rect_w}" height="{rect_h}" '
        f'fill="#f0f9ff" stroke="#1e40af" stroke-width="1" '
        f'stroke-dasharray="8,4"/>'
        f'<text x="{W/2}" y="{H/2}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="12" fill="#94a3b8">'
        f'HLR projection unavailable</text>'
        f'<rect x="1" y="{H-38}" width="{W-2}" height="37" '
        f'fill="#f8fafc" stroke="#334155" stroke-width="0.75"/>'
        f'<text x="{W/2}" y="{H-22}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="11" font-weight="bold" '
        f'fill="#0f172a">{title}</text>'
        f'<text x="{W/2}" y="{H-8}" text-anchor="middle" '
        f'font-family="Arial,sans-serif" font-size="8" fill="#64748b">'
        f'DIMS: {h_dim:.1f} x {v_dim:.1f} mm (fallback)</text>'
        f'</svg>'
    )


def _stub_svgs() -> dict[str, Any]:
    """Return placeholder SVGs when OCCT is completely unavailable."""
    stub = (
        '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="400" '
        'viewBox="0 0 500 400" style="background:#fff">'
        '<rect x="1" y="1" width="498" height="398" fill="none" '
        'stroke="#334155" stroke-width="1.5"/>'
        '<text x="250" y="200" text-anchor="middle" '
        'font-family="Arial,sans-serif" font-size="14" fill="#94a3b8">'
        'OCCT not available — upload STEP for real projections</text>'
        '</svg>'
    )
    return {
        "front_view": stub,
        "top_view": stub,
        "side_view": stub,
        "dimensions": {"length_mm": 0, "width_mm": 0, "height_mm": 0},
    }
