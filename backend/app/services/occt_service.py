"""
OCCT (pythonocc-core) service.

Runs as a Celery worker process (CPU-bound).
Parses STEP files → extracts features → converts to GLTF for Three.js.

In environments without pythonocc-core installed, returns stub/mock data.
"""
import logging
import io
import uuid
import numpy as np
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

try:
    from OCC.Core.STEPControl import STEPControl_Reader
    from OCC.Core.IFSelect import IFSelect_RetDone
    from OCC.Core.BRep import BRep_Tool
    from OCC.Core.BRepGProp import brepgprop_SurfaceProperties, brepgprop_VolumeProperties
    from OCC.Core.GProp import GProp_GProps
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopAbs import TopAbs_FACE, TopAbs_EDGE
    from OCC.Core.BRepAdaptor import BRepAdaptor_Surface
    from OCC.Core.GeomAbs import GeomAbs_Plane, GeomAbs_Cylinder
    from OCC.Core.BRepBndLib import brepbndlib_Add as _brepbndlib_Add
    from OCC.Core.Bnd import Bnd_Box as _Bnd_Box
    from OCC.Core.gp import gp_Dir
    from OCC.Extend.DataExchange import write_gltf_file, write_iges_file, write_step_file
    OCCT_AVAILABLE = True
    log.info("pythonocc-core loaded OK")
except ImportError:
    OCCT_AVAILABLE = False
    log.warning("pythonocc-core not available — using stub geometry extraction")


def parse_step_file(step_bytes: bytes) -> dict[str, Any] | None:
    """
    Parse a STEP file (bytes) and return extracted features.
    Returns None if parsing fails.
    """
    if not OCCT_AVAILABLE:
        log.info("OCCT not available — returning mock features")
        return _mock_features()

    # Write bytes to temp file (OCCT needs a file path)
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp:
        tmp.write(step_bytes)
        tmp_path = tmp.name

    try:
        reader = STEPControl_Reader()
        status = reader.ReadFile(tmp_path)
        if status != IFSelect_RetDone:
            log.error("STEP reader failed with status %s", status)
            return None

        reader.TransferRoots()
        shape = reader.OneShape()

        features = _extract_features(shape)
        return features
    except Exception as e:
        log.exception("OCCT parse_step_file error: %s", e)
        return None
    finally:
        Path(tmp_path).unlink(missing_ok=True)


def convert_step_to_gltf(step_bytes: bytes) -> bytes | None:
    """
    Convert STEP → GLTF binary for Three.js viewport.
    Returns GLTF bytes, or None on failure.
    """
    if not OCCT_AVAILABLE:
        log.info("OCCT not available — returning None for GLTF conversion")
        return None

    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp_in:
        tmp_in.write(step_bytes)
        step_path = tmp_in.name

    gltf_path = step_path.replace(".step", ".gltf")

    try:
        reader = STEPControl_Reader()
        status = reader.ReadFile(step_path)
        if status != IFSelect_RetDone:
            return None

        reader.TransferRoots()
        shape = reader.OneShape()

        write_gltf_file(shape, gltf_path)

        with open(gltf_path, "rb") as f:
            return f.read()
    except Exception as e:
        log.exception("OCCT STEP→GLTF error: %s", e)
        return None
    finally:
        Path(step_path).unlink(missing_ok=True)
        Path(gltf_path).unlink(missing_ok=True)


# ── Private helpers ────────────────────────────────────────────────────────────

def _extract_features(shape) -> dict[str, Any]:
    """Extract bounding box, volume, faces, holes from a B-rep shape."""
    from OCC.Core.Bnd import Bnd_Box
    from OCC.Core.BRepBndLib import brepbndlib_Add

    # Bounding box
    bbox = Bnd_Box()
    brepbndlib_Add(shape, bbox)
    xmin, ymin, zmin, xmax, ymax, zmax = bbox.Get()
    bounding_box = {
        "x": round(xmax - xmin, 3),
        "y": round(ymax - ymin, 3),
        "z": round(zmax - zmin, 3),
    }

    # Volume + surface area
    vol_props = GProp_GProps()
    brepgprop_VolumeProperties(shape, vol_props)
    volume_mm3 = round(vol_props.Mass(), 3)

    surf_props = GProp_GProps()
    brepgprop_SurfaceProperties(shape, surf_props)
    surface_area_mm2 = round(surf_props.Mass(), 3)

    # Faces
    face_explorer = TopExp_Explorer(shape, TopAbs_FACE)
    faces = []
    face_count = 0
    largest_area = 0.0
    datum_candidates = []

    while face_explorer.More():
        face = face_explorer.Current()
        face_count += 1
        face_id = f"face_{face_count:03d}"

        # Area
        gp = GProp_GProps()
        brepgprop_SurfaceProperties(face, gp)
        area = round(gp.Mass(), 3)

        # Normal (for planar faces)
        adaptor = BRepAdaptor_Surface(face)
        is_planar = adaptor.GetType() == GeomAbs_Plane
        normal = [0.0, 0.0, 0.0]
        centroid = [0.0, 0.0, 0.0]

        if is_planar:
            plane = adaptor.Plane()
            n = plane.Axis().Direction()
            normal = [round(n.X(), 4), round(n.Y(), 4), round(n.Z(), 4)]
            c = gp.CentreOfMass()
            centroid = [round(c.X(), 3), round(c.Y(), 3), round(c.Z(), 3)]

        # Datum candidate = large flat face
        is_datum = is_planar and area > 500.0
        if is_datum:
            datum_candidates.append(face_id)
            if area > largest_area:
                largest_area = area

        faces.append({
            "id": face_id,
            "area_mm2": area,
            "normal": normal,
            "centroid": centroid,
            "is_planar": is_planar,
            "is_datum_candidate": is_datum,
        })
        face_explorer.Next()

    # Edge count
    edge_explorer = TopExp_Explorer(shape, TopAbs_EDGE)
    edge_count = 0
    while edge_explorer.More():
        edge_count += 1
        edge_explorer.Next()

    # ── Cylindrical face pass: detect holes ──────────────────────────────────
    detected_holes = []
    cyl_explorer = TopExp_Explorer(shape, TopAbs_FACE)
    cyl_seen: set[str] = set()

    while cyl_explorer.More():
        cyl_face = cyl_explorer.Current()
        cyl_adaptor = BRepAdaptor_Surface(cyl_face)
        if cyl_adaptor.GetType() == GeomAbs_Cylinder:
            cylinder = cyl_adaptor.Cylinder()
            radius = cylinder.Radius()
            axis_loc = cylinder.Location()
            axis_dir = cylinder.Axis().Direction()

            # Deduplicate by center + radius (rounded)
            center_key = f"{round(axis_loc.X(),1)},{round(axis_loc.Y(),1)},{round(axis_loc.Z(),1)},{round(radius,2)}"
            if center_key in cyl_seen:
                cyl_explorer.Next()
                continue
            cyl_seen.add(center_key)

            # Estimate depth from face bounding box
            face_bbox = _Bnd_Box()
            _brepbndlib_Add(cyl_face, face_bbox)
            bxmin, bymin, bzmin, bxmax, bymax, bzmax = face_bbox.Get()
            dx = round(abs(bxmax - bxmin), 3)
            dy = round(abs(bymax - bymin), 3)
            dz = round(abs(bzmax - bzmin), 3)
            # Depth is along the axis direction — use largest delta perpendicular to radius
            depth = round(max(dx, dy, dz), 3)
            if depth < 0.5:
                depth = max(dx, dy, dz, 1.0)

            # Classify: counterbore if two cylinders share same axis with different radii (simplified: check radius)
            hole_type = "through"  # default; refine below
            if depth < radius * 2:
                hole_type = "blind"

            detected_holes.append({
                "center": [round(axis_loc.X(), 3), round(axis_loc.Y(), 3), round(axis_loc.Z(), 3)],
                "diameter": round(radius * 2, 3),
                "depth": depth,
                "axis": [round(axis_dir.X(), 4), round(axis_dir.Y(), 4), round(axis_dir.Z(), 4)],
                "type": hole_type,
            })
        cyl_explorer.Next()

    # Counterbore detection: if two holes share center XY within 1mm, smaller radius is counterbore
    for i, h in enumerate(detected_holes):
        for j, h2 in enumerate(detected_holes):
            if i == j:
                continue
            cx1, cy1 = h["center"][0], h["center"][1]
            cx2, cy2 = h2["center"][0], h2["center"][1]
            if abs(cx1 - cx2) < 1.0 and abs(cy1 - cy2) < 1.0 and h["diameter"] < h2["diameter"]:
                detected_holes[i]["type"] = "counterbore"
                break

    return {
        "bounding_box": bounding_box,
        "volume_mm3": volume_mm3,
        "surface_area_mm2": surface_area_mm2,
        "face_count": face_count,
        "edge_count": edge_count,
        "hole_count": len(detected_holes),
        "faces": faces,
        "datum_candidates": datum_candidates[:3],
        "detected_holes": detected_holes,
        "material_hint": None,
    }


def _mock_features() -> dict[str, Any]:
    """Stub features returned when OCCT is not installed."""
    return {
        "bounding_box": {"x": 150.0, "y": 100.0, "z": 20.0},
        "volume_mm3": 180000.0,
        "surface_area_mm2": 95000.0,
        "face_count": 12,
        "edge_count": 24,
        "hole_count": 4,
        "faces": [
            {
                "id": "face_001",
                "area_mm2": 15000.0,
                "normal": [0.0, 0.0, 1.0],
                "centroid": [75.0, 50.0, 20.0],
                "is_planar": True,
                "is_datum_candidate": True,
            },
            {
                "id": "face_002",
                "area_mm2": 15000.0,
                "normal": [0.0, 0.0, -1.0],
                "centroid": [75.0, 50.0, 0.0],
                "is_planar": True,
                "is_datum_candidate": True,
            },
        ],
        "datum_candidates": ["face_001", "face_002"],
        "detected_holes": [
            {"center": [30.0, 30.0, 0.0], "diameter": 8.0, "depth": 20.0, "axis": [0.0, 0.0, 1.0]},
            {"center": [120.0, 30.0, 0.0], "diameter": 8.0, "depth": 20.0, "axis": [0.0, 0.0, 1.0]},
            {"center": [30.0, 70.0, 0.0], "diameter": 8.0, "depth": 20.0, "axis": [0.0, 0.0, 1.0]},
            {"center": [120.0, 70.0, 0.0], "diameter": 8.0, "depth": 20.0, "axis": [0.0, 0.0, 1.0]},
        ],
        "material_hint": None,
    }


def export_to_iges(step_bytes: bytes) -> bytes:
    """
    Convert STEP bytes to IGES bytes using OCCT.
    Returns mock bytes if OCCT is unavailable.
    """
    if not OCCT_AVAILABLE:
        log.warning("OCCT not available — returning stub IGES bytes")
        return b"IGES stub data"

    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp_in:
        tmp_in.write(step_bytes)
        tmp_in_path = tmp_in.name

    tmp_out_path = tmp_in_path.replace(".step", ".iges")
    try:
        from OCC.Core.STEPControl import STEPControl_Reader
        from OCC.Core.IFSelect import IFSelect_RetDone
        reader = STEPControl_Reader()
        status = reader.ReadFile(tmp_in_path)
        if status != IFSelect_RetDone:
            raise RuntimeError("STEP read failed")
        reader.TransferRoots()
        shape = reader.OneShape()
        write_iges_file(shape, tmp_out_path)
        with open(tmp_out_path, "rb") as f:
            return f.read()
    finally:
        for p in (tmp_in_path, tmp_out_path):
            try:
                os.unlink(p)
            except OSError:
                pass


def export_to_dxf(step_bytes: bytes) -> bytes:
    """
    Generate a DXF-like text file from STEP by projecting the top face
    outlines. This is a simplified 2D extraction using OCCT edge iteration.
    Returns mock bytes if OCCT is unavailable.
    """
    if not OCCT_AVAILABLE:
        log.warning("OCCT not available — returning stub DXF bytes")
        return b"DXF stub data"

    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".step", delete=False) as tmp_in:
        tmp_in.write(step_bytes)
        tmp_in_path = tmp_in.name

    try:
        from OCC.Core.STEPControl import STEPControl_Reader
        from OCC.Core.IFSelect import IFSelect_RetDone
        from OCC.Core.TopExp import TopExp_Explorer
        from OCC.Core.TopAbs import TopAbs_EDGE
        from OCC.Core.BRep import BRep_Tool
        from OCC.Core.BRepAdaptor import BRepAdaptor_Curve
        from OCC.Core.GCPnts import GCPnts_UniformAbscissa

        reader = STEPControl_Reader()
        status = reader.ReadFile(tmp_in_path)
        if status != IFSelect_RetDone:
            raise RuntimeError("STEP read failed for DXF export")
        reader.TransferRoots()
        shape = reader.OneShape()

        lines: list[str] = []
        lines.append("0\nSECTION\n2\nENTITIES")
        explorer = TopExp_Explorer(shape, TopAbs_EDGE)
        entity_seq = 1
        while explorer.More():
            edge = explorer.Current()
            adaptor = BRepAdaptor_Curve(edge)
            sampler = GCPnts_UniformAbscissa(adaptor, 8, adaptor.FirstParameter(), adaptor.LastParameter())
            pts = []
            for i in range(1, sampler.NbPoints() + 1):
                p = adaptor.Value(sampler.Parameter(i))
                pts.append((round(p.X(), 4), round(p.Y(), 4)))
            for i in range(len(pts) - 1):
                x1, y1 = pts[i]
                x2, y2 = pts[i + 1]
                lines.append(f"0\nLINE\n8\n0\n10\n{x1}\n20\n{y1}\n30\n0.0\n11\n{x2}\n21\n{y2}\n31\n0.0")
                entity_seq += 1
            explorer.Next()

        lines.append("0\nENDSEC\n0\nEOF")
        return "\n".join(lines).encode("utf-8")
    except Exception as e:
        log.error("DXF export failed: %s", e)
        return b"DXF export failed"
    finally:
        try:
            os.unlink(tmp_in_path)
        except OSError:
            pass
