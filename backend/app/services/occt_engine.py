"""
OCCT engine — real B-rep solid modeling via pythonocc-core.

Provides primitive creation, boolean operations, fillet/chamfer, and
STEP/IGES/STL export.  All public functions return None / False on failure
and never raise, so callers can check the return value and fall back to stubs.
"""
import logging
import re
import tempfile
from pathlib import Path
from typing import Any

log = logging.getLogger(__name__)

try:
    from OCC.Core.BRepPrimAPI import (
        BRepPrimAPI_MakeBox,
        BRepPrimAPI_MakeCylinder,
        BRepPrimAPI_MakeSphere,
    )
    from OCC.Core.BRepAlgoAPI import BRepAlgoAPI_Fuse, BRepAlgoAPI_Cut
    from OCC.Core.BRepFilletAPI import BRepFilletAPI_MakeFillet, BRepFilletAPI_MakeChamfer
    from OCC.Core.BRepMesh import BRepMesh_IncrementalMesh
    from OCC.Core.StlAPI import StlAPI_Writer
    from OCC.Core.STEPControl import STEPControl_Writer, STEPControl_AsIs
    from OCC.Core.IGESControl import IGESControl_Writer
    from OCC.Core.IFSelect import IFSelect_RetDone
    from OCC.Core.TopExp import TopExp_Explorer
    from OCC.Core.TopAbs import TopAbs_EDGE
    from OCC.Core.gp import gp_Trsf, gp_Vec
    from OCC.Core.BRepBuilderAPI import BRepBuilderAPI_Transform

    OCCT_ENGINE_AVAILABLE = True
    log.info("pythonocc-core occt_engine loaded OK")
except ImportError:
    OCCT_ENGINE_AVAILABLE = False
    log.warning("pythonocc-core not available — occt_engine will return None for all operations")


# ── Primitives ─────────────────────────────────────────────────────────────────

def create_box(length: float, width: float, height: float):
    """Return an OCCT solid box. Returns None if OCCT unavailable."""
    if not OCCT_ENGINE_AVAILABLE:
        return None
    try:
        return BRepPrimAPI_MakeBox(float(length), float(width), float(height)).Shape()
    except Exception as e:
        log.error("create_box failed: %s", e)
        return None


def create_cylinder(radius: float, height: float):
    """Return an OCCT solid cylinder (axis along Z). Returns None if OCCT unavailable."""
    if not OCCT_ENGINE_AVAILABLE:
        return None
    try:
        return BRepPrimAPI_MakeCylinder(float(radius), float(height)).Shape()
    except Exception as e:
        log.error("create_cylinder failed: %s", e)
        return None


def create_sphere(radius: float):
    """Return an OCCT solid sphere. Returns None if OCCT unavailable."""
    if not OCCT_ENGINE_AVAILABLE:
        return None
    try:
        return BRepPrimAPI_MakeSphere(float(radius)).Shape()
    except Exception as e:
        log.error("create_sphere failed: %s", e)
        return None


# ── Booleans ───────────────────────────────────────────────────────────────────

def boolean_union(solid_a, solid_b):
    """Return the Boolean union (fuse) of two solids. Returns solid_a on failure."""
    if not OCCT_ENGINE_AVAILABLE or solid_a is None or solid_b is None:
        return solid_a
    try:
        op = BRepAlgoAPI_Fuse(solid_a, solid_b)
        op.Build()
        if not op.IsDone():
            log.warning("boolean_union: BRepAlgoAPI_Fuse not done")
            return solid_a
        return op.Shape()
    except Exception as e:
        log.error("boolean_union failed: %s", e)
        return solid_a


def boolean_subtract(solid_a, solid_b):
    """Return solid_a minus solid_b (Boolean cut). Returns solid_a on failure."""
    if not OCCT_ENGINE_AVAILABLE or solid_a is None or solid_b is None:
        return solid_a
    try:
        op = BRepAlgoAPI_Cut(solid_a, solid_b)
        op.Build()
        if not op.IsDone():
            log.warning("boolean_subtract: BRepAlgoAPI_Cut not done")
            return solid_a
        return op.Shape()
    except Exception as e:
        log.error("boolean_subtract failed: %s", e)
        return solid_a


# ── Modifiers ─────────────────────────────────────────────────────────────────

def add_fillet(solid, edges: list | None, radius: float):
    """
    Add fillet of given radius.
    If edges is None, apply to all edges of the solid.
    Returns original solid on failure.
    """
    if not OCCT_ENGINE_AVAILABLE or solid is None:
        return solid
    try:
        op = BRepFilletAPI_MakeFillet(solid)
        if edges:
            for edge in edges:
                op.Add(float(radius), edge)
        else:
            exp = TopExp_Explorer(solid, TopAbs_EDGE)
            while exp.More():
                op.Add(float(radius), exp.Current())
                exp.Next()
        op.Build()
        if not op.IsDone():
            log.warning("add_fillet: not done, returning original solid")
            return solid
        return op.Shape()
    except Exception as e:
        log.error("add_fillet failed: %s", e)
        return solid


def add_chamfer(solid, edges: list | None, distance: float):
    """
    Add chamfer of given distance.
    If edges is None, apply to all edges of the solid.
    Returns original solid on failure.
    """
    if not OCCT_ENGINE_AVAILABLE or solid is None:
        return solid
    try:
        op = BRepFilletAPI_MakeChamfer(solid)
        if edges:
            for edge in edges:
                op.Add(float(distance), edge)
        else:
            exp = TopExp_Explorer(solid, TopAbs_EDGE)
            while exp.More():
                op.Add(float(distance), exp.Current())
                exp.Next()
        op.Build()
        if not op.IsDone():
            log.warning("add_chamfer: not done, returning original solid")
            return solid
        return op.Shape()
    except Exception as e:
        log.error("add_chamfer failed: %s", e)
        return solid


def translate_solid(solid, dx: float, dy: float, dz: float):
    """Translate a solid by (dx, dy, dz). Returns original solid on failure."""
    if not OCCT_ENGINE_AVAILABLE or solid is None:
        return solid
    try:
        trsf = gp_Trsf()
        trsf.SetTranslation(gp_Vec(float(dx), float(dy), float(dz)))
        return BRepBuilderAPI_Transform(solid, trsf, True).Shape()
    except Exception as e:
        log.error("translate_solid failed: %s", e)
        return solid


# ── Export ─────────────────────────────────────────────────────────────────────

def export_step(solid, filepath: str) -> bool:
    """Write solid to STEP AP214 file. Returns True on success."""
    if not OCCT_ENGINE_AVAILABLE or solid is None:
        return False
    try:
        writer = STEPControl_Writer()
        writer.Transfer(solid, STEPControl_AsIs)
        status = writer.Write(str(filepath))
        return status == IFSelect_RetDone
    except Exception as e:
        log.error("export_step failed: %s", e)
        return False


def export_iges(solid, filepath: str) -> bool:
    """Write solid to IGES file. Returns True on success."""
    if not OCCT_ENGINE_AVAILABLE or solid is None:
        return False
    try:
        writer = IGESControl_Writer()
        writer.AddShape(solid)
        writer.ComputeModel()
        return bool(writer.Write(str(filepath)))
    except Exception as e:
        log.error("export_iges failed: %s", e)
        return False


def export_stl(solid, filepath: str, tolerance: float = 0.1) -> bool:
    """Mesh solid and write to ASCII STL. Returns True on success."""
    if not OCCT_ENGINE_AVAILABLE or solid is None:
        return False
    try:
        mesh = BRepMesh_IncrementalMesh(solid, float(tolerance))
        mesh.Perform()
        writer = StlAPI_Writer()
        writer.ASCIIMode = True
        return bool(writer.Write(solid, str(filepath)))
    except Exception as e:
        log.error("export_stl failed: %s", e)
        return False


# ── Build solid from features_json ─────────────────────────────────────────────

def features_to_solid(features_json: dict | list | None):
    """
    Build an OCCT solid from the features_json stored in part_geometries.

    Accepts either:
    - dict with keys bounding_box / detected_holes (output of occt_service)
    - list of feature dicts with type/centroid/radius keys
    """
    if not OCCT_ENGINE_AVAILABLE or features_json is None:
        return None
    try:
        if isinstance(features_json, list):
            return _build_from_list(features_json)
        return _build_from_dict(features_json)
    except Exception as e:
        log.error("features_to_solid failed: %s", e)
        return None


def _build_from_dict(fj: dict):
    """Build from {bounding_box, detected_holes} dict."""
    bb = fj.get("bounding_box", {})
    lx = max(float(bb.get("x", 100.0)), 1.0)
    ly = max(float(bb.get("y", 100.0)), 1.0)
    lz = max(float(bb.get("z", 20.0)), 1.0)

    solid = create_box(lx, ly, lz)
    if solid is None:
        return None

    for hole in fj.get("detected_holes", []):
        if not isinstance(hole, dict):
            continue
        diam = float(hole.get("diameter", 0.0))
        if diam <= 0:
            continue
        depth = max(float(hole.get("depth", lz)), 0.1)
        center = hole.get("center", [lx / 2, ly / 2, 0])
        if not isinstance(center, (list, tuple)) or len(center) < 3:
            continue
        cx, cy, cz = float(center[0]), float(center[1]), float(center[2])
        # +2 mm overcut ensures clean through/blind cut
        cyl = create_cylinder(diam / 2.0, depth + 2.0)
        if cyl is None:
            continue
        cyl = translate_solid(cyl, cx, cy, cz - 1.0)
        solid = boolean_subtract(solid, cyl)

    return solid


def _build_from_list(features: list):
    """Build from flat list of feature dicts."""
    solid = None
    for feat in features:
        if not isinstance(feat, dict):
            continue
        ftype = feat.get("type", "box").lower()
        centroid = feat.get("centroid", [0.0, 0.0, 0.0])
        if not isinstance(centroid, (list, tuple)) or len(centroid) < 3:
            centroid = [0.0, 0.0, 0.0]
        cx, cy, cz = float(centroid[0]), float(centroid[1]), float(centroid[2])

        if ftype in ("box", "extrude", ""):
            lx = max(float(feat.get("length", feat.get("width", feat.get("x", 100.0)))), 1.0)
            ly = max(float(feat.get("width", feat.get("y", 100.0))), 1.0)
            lz = max(float(feat.get("height", feat.get("depth", feat.get("z", 20.0)))), 1.0)
            piece = create_box(lx, ly, lz)
            if piece is None:
                continue
            piece = translate_solid(piece, cx, cy, cz)
            solid = boolean_union(solid, piece) if solid else piece

        elif ftype in ("hole", "cylinder"):
            r_raw = feat.get("radius", feat.get("diameter", 10.0))
            if isinstance(r_raw, str):
                r_raw = 10.0
            radius = max(float(r_raw if feat.get("radius") else float(r_raw) / 2.0), 0.1)
            h = max(float(feat.get("height", feat.get("depth", 20.0))), 0.1)
            cyl = create_cylinder(radius, h + 2.0)
            if cyl is not None and solid is not None:
                cyl = translate_solid(cyl, cx, cy, cz - 1.0)
                solid = boolean_subtract(solid, cyl)

    return solid


# ── Build solid from KCL code ──────────────────────────────────────────────────

def kcl_to_solid(kcl_code: str):
    """
    Parse a subset of KCL (Zoo.dev CAD scripting language) and build an OCCT solid.

    Supported operations:
      extrude(length=L, width=W, height=H)
      revolve(radius=R, height=H)          — modelled as cylinder
      hole(x=X, y=Y, diameter=D, depth=DP)
      fillet(radius=R)                     — applied to all edges
      chamfer(distance=D)                  — applied to all edges
    """
    if not OCCT_ENGINE_AVAILABLE or not kcl_code:
        return None
    try:
        solid = None
        for line in kcl_code.splitlines():
            line = line.strip()
            if not line or line.startswith("//") or line.startswith("#"):
                continue

            m = re.search(r"extrude\s*\(([^)]*)\)", line, re.IGNORECASE)
            if m:
                p = _parse_params(m.group(1))
                lx = max(float(p.get("length", p.get("x", 100))), 1.0)
                ly = max(float(p.get("width", p.get("y", 100))), 1.0)
                lz = max(float(p.get("height", p.get("z", 20))), 1.0)
                piece = create_box(lx, ly, lz)
                solid = boolean_union(solid, piece) if solid else piece
                continue

            m = re.search(r"revolve\s*\(([^)]*)\)", line, re.IGNORECASE)
            if m:
                p = _parse_params(m.group(1))
                r = max(float(p.get("radius", 10)), 0.1)
                h = max(float(p.get("height", 20)), 0.1)
                piece = create_cylinder(r, h)
                solid = boolean_union(solid, piece) if solid else piece
                continue

            m = re.search(r"hole\s*\(([^)]*)\)", line, re.IGNORECASE)
            if m and solid is not None:
                p = _parse_params(m.group(1))
                x = float(p.get("x", 0))
                y = float(p.get("y", 0))
                d = max(float(p.get("diameter", p.get("d", 10))), 0.2)
                depth = max(float(p.get("depth", 20)), 0.1)
                cyl = create_cylinder(d / 2.0, depth + 2.0)
                if cyl:
                    cyl = translate_solid(cyl, x, y, -1.0)
                    solid = boolean_subtract(solid, cyl)
                continue

            m = re.search(r"fillet\s*\(([^)]*)\)", line, re.IGNORECASE)
            if m and solid is not None:
                p = _parse_params(m.group(1))
                r = max(float(p.get("radius", p.get("r", 1.0))), 0.01)
                solid = add_fillet(solid, None, r)
                continue

            m = re.search(r"chamfer\s*\(([^)]*)\)", line, re.IGNORECASE)
            if m and solid is not None:
                p = _parse_params(m.group(1))
                d = max(float(p.get("distance", p.get("d", 1.0))), 0.01)
                solid = add_chamfer(solid, None, d)
                continue

        return solid
    except Exception as e:
        log.error("kcl_to_solid failed: %s", e)
        return None


def _parse_params(param_str: str) -> dict[str, float]:
    """Parse 'key=val, key2=val2' into {key: float}."""
    params: dict[str, float] = {}
    for part in param_str.split(","):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            try:
                params[k.strip()] = float(v.strip())
            except ValueError:
                pass
    return params


# ── Convenience: solid → bytes ─────────────────────────────────────────────────

def features_to_step_bytes(features_json: Any) -> bytes | None:
    """Build solid from features_json and return STEP bytes. None if unavailable."""
    return _to_bytes(features_to_solid(features_json), "step")


def features_to_iges_bytes(features_json: Any) -> bytes | None:
    """Build solid from features_json and return IGES bytes. None if unavailable."""
    return _to_bytes(features_to_solid(features_json), "iges")


def features_to_stl_bytes(features_json: Any, tolerance: float = 0.1) -> bytes | None:
    """Build solid from features_json and return STL bytes. None if unavailable."""
    return _to_bytes(features_to_solid(features_json), "stl", tolerance=tolerance)


def kcl_to_step_bytes(kcl_code: str) -> bytes | None:
    """Build solid from KCL and return STEP bytes. None if unavailable."""
    return _to_bytes(kcl_to_solid(kcl_code), "step")


def kcl_to_stl_bytes(kcl_code: str, tolerance: float = 0.1) -> bytes | None:
    """Build solid from KCL and return STL bytes. None if unavailable."""
    return _to_bytes(kcl_to_solid(kcl_code), "stl", tolerance=tolerance)


def _to_bytes(solid, fmt: str, **kwargs) -> bytes | None:
    """Export solid to bytes via a temp file. Returns None on any failure."""
    if solid is None:
        return None
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=f".{fmt}", delete=False) as tmp:
            tmp_path = tmp.name

        ok = False
        if fmt == "step":
            ok = export_step(solid, tmp_path)
        elif fmt == "iges":
            ok = export_iges(solid, tmp_path)
        elif fmt == "stl":
            ok = export_stl(solid, tmp_path, tolerance=kwargs.get("tolerance", 0.1))

        if not ok:
            return None

        with open(tmp_path, "rb") as f:
            return f.read()
    except Exception as e:
        log.error("_to_bytes failed: %s", e)
        return None
    finally:
        if tmp_path:
            Path(tmp_path).unlink(missing_ok=True)
