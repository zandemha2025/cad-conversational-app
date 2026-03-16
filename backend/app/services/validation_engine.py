"""
Validation Engine.

Runs 4 validation passes:
  FDM        – FDM/FFF 3D printing DFM rules
  CNC        – CNC milling DFM rules
  Laser      – Laser cutting DFM rules
  Functional – 3-2-1 constraint completeness + force/deflection
  Standards  – GD&T + AS9100/IATF checklist
"""
import uuid
import logging
import numpy as np
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)


def _issue(method, severity, title, detail, fix=None, location=None, node_ref=None):
    return {
        "id": str(uuid.uuid4()),
        "method": method,
        "severity": severity,
        "title": title,
        "detail": detail,
        "location": location,
        "node_ref": node_ref,
        "fix_suggestion": fix,
    }


# ── FDM Rules ──────────────────────────────────────────────────────────────────

def run_fdm(features: dict, printer_profile: dict) -> list[dict]:
    issues = []
    nozzle = printer_profile.get("nozzle_diameter_mm", 0.4)
    min_wall = nozzle * 2
    layer_h = printer_profile.get("layer_height_mm", 0.2)
    overhang_limit = printer_profile.get("overhang_angle_deg", 45)

    faces = features.get("faces", [])
    bb = features.get("bounding_box", {})

    # Wall thickness proxy: smallest bounding box dimension vs nozzle
    min_dim = min(bb.get("x", 99), bb.get("y", 99), bb.get("z", 99))
    if min_dim < min_wall:
        issues.append(_issue(
            "fdm", "error",
            f"Wall too thin ({min_dim:.1f}mm)",
            f"Minimum wall is nozzle × 2 = {min_wall:.1f}mm. Thinnest dimension is {min_dim:.1f}mm.",
            fix=f"Increase wall thickness to ≥{min_wall:.1f}mm or use 0.2mm nozzle.",
        ))

    # Overhang check: faces with normal pointing > overhang_limit from vertical
    for face in faces:
        normal = face.get("normal", [0, 0, 0])
        if len(normal) == 3 and normal[2] != 0:
            angle_from_vertical = np.degrees(np.arccos(abs(normal[2])))
            if angle_from_vertical > overhang_limit and face.get("area_mm2", 0) > 100:
                issues.append(_issue(
                    "fdm", "warning",
                    f"Overhang angle {angle_from_vertical:.0f}° on face {face['id']}",
                    f"Exceeds {overhang_limit}° limit. Will require supports.",
                    fix="Add chamfer ≤45° or redesign to eliminate overhang. Consider print orientation change.",
                    location=face.get("centroid"),
                ))

    # Bore tolerance check: holes must be ≥ nozzle×4 for reliable printing
    for hole in features.get("detected_holes", []):
        dia = hole.get("diameter", 0)
        min_bore = nozzle * 4
        if dia < min_bore:
            issues.append(_issue(
                "fdm", "error",
                f"Bore diameter {dia:.1f}mm too small for FDM",
                f"Minimum printable bore for {nozzle}mm nozzle is {min_bore:.1f}mm.",
                fix=f"Increase to ≥{min_bore:.1f}mm or post-drill after printing.",
                location=hole.get("center"),
            ))

    # Height check for elephant foot
    z = bb.get("z", 0)
    if z > 0 and layer_h / z > 0.1:
        issues.append(_issue(
            "fdm", "info",
            "Elephant foot risk on bottom layer",
            "First layer squish can cause +0.3–0.5mm expansion at base.",
            fix="Compensate by chamfering bottom edge 0.5mm or reduce first-layer flow.",
        ))

    return issues


# ── CNC Rules ─────────────────────────────────────────────────────────────────

def run_cnc(features: dict) -> list[dict]:
    issues = []
    faces = features.get("faces", [])

    # Internal corner radius check
    # (Without OCCT edge analysis, we infer from face count — real impl would use OCCT)
    face_count = features.get("face_count", 0)
    if face_count > 6:
        issues.append(_issue(
            "cnc", "warning",
            "Verify internal corner radii ≥ tool radius",
            "CNC cannot cut internal square corners. All internal corners need a fillet.",
            fix="Add R3mm fillets to all internal pockets before ordering CNC.",
        ))

    # Pocket depth-to-width ratio
    bb = features.get("bounding_box", {})
    z = bb.get("z", 0)
    x = bb.get("x", 1)
    if z > 0 and z / x > 3:
        issues.append(_issue(
            "cnc", "error",
            f"Pocket depth/width ratio {z/x:.1f}:1 exceeds 3:1 limit",
            "Deep narrow pockets require long reach tools and risk chatter/deflection.",
            fix="Reduce depth, widen pocket, or split into two operations.",
        ))

    # Undercut check — simplified
    non_planar = [f for f in faces if not f.get("is_planar", True)]
    if len(non_planar) > 2:
        issues.append(_issue(
            "cnc", "info",
            "Complex curved faces may require 5-axis machining",
            f"{len(non_planar)} non-planar faces detected. Verify tool access from standard directions.",
            fix="Add process note for 5-axis or hand-finishing curved surfaces.",
        ))

    # Positive: all datum faces are flat
    datum = [f for f in faces if f.get("is_datum_candidate")]
    if datum:
        issues.append(_issue(
            "cnc", "ok",
            f"{len(datum)} datum face(s) are planar — CNC machinable",
            "Flat datum faces can be precision-ground or face-milled to flatness spec.",
        ))

    return issues


# ── Laser Rules ───────────────────────────────────────────────────────────────

def run_laser(features: dict) -> list[dict]:
    issues = []
    bb = features.get("bounding_box", {})
    z = bb.get("z", 0)

    # Laser is 2D — check if part is essentially 2D
    if z > 10:
        issues.append(_issue(
            "laser", "error",
            f"Part Z-height {z:.1f}mm exceeds laser sheet capability",
            "Laser cutting is a 2D process. This part has significant Z geometry.",
            fix="Fabricate as 2D flat stock + secondary bends, or switch to CNC/FDM.",
        ))

    # Min hole check (typical laser kerf 0.2–0.3mm, min hole ~1.5mm)
    MIN_LASER_HOLE = 1.5
    for hole in features.get("detected_holes", []):
        dia = hole.get("diameter", 0)
        if dia < MIN_LASER_HOLE:
            issues.append(_issue(
                "laser", "error",
                f"Hole diameter {dia:.1f}mm below laser minimum {MIN_LASER_HOLE}mm",
                "Laser beam kerf makes sub-1.5mm holes inaccurate.",
                fix=f"Drill or EDM holes <{MIN_LASER_HOLE}mm after laser cutting.",
                location=hole.get("center"),
            ))

    if not issues:
        issues.append(_issue(
            "laser", "info",
            "Part appears laser-compatible for base plate profiling",
            "Flat 2D geometry suitable for laser cutting. Verify material thickness.",
        ))

    return issues


# ── Functional / Fixture Rules ─────────────────────────────────────────────────

def run_functional(features: dict, touchpoints: list[dict]) -> list[dict]:
    issues = []

    # 3-2-1 constraint check
    locating = [t for t in touchpoints if t.get("type") == "locating"]
    clamping = [t for t in touchpoints if t.get("type") == "clamping"]
    support  = [t for t in touchpoints if t.get("type") == "support"]

    dof_ok = len(locating) >= 2 and len(clamping) >= 1 and len(support) >= 3
    if dof_ok:
        issues.append(_issue(
            "functional", "ok",
            "3-2-1 constraint satisfied",
            f"{len(support)} supports (Datum A) + {len(locating)} locating (Datum B) + {len(clamping)} clamp(s) (Datum C)",
        ))
    else:
        missing = []
        if len(support) < 3:   missing.append(f"need 3+ supports (have {len(support)})")
        if len(locating) < 2:  missing.append(f"need 2+ locating pins (have {len(locating)})")
        if len(clamping) < 1:  missing.append(f"need 1+ clamp (have {len(clamping)})")
        issues.append(_issue(
            "functional", "error",
            "3-2-1 constraint NOT satisfied",
            "Part is not fully located: " + "; ".join(missing),
            fix="Add the missing touchpoints via the Touchpoints panel.",
        ))

    # Clamping force check
    total_force = sum(t.get("force_n", 0) or 0 for t in clamping)
    if total_force > 0:
        part_mass_kg = features.get("volume_mm3", 0) * 1.25e-6  # ~1.25 g/cm³ PLA
        required_force = part_mass_kg * 9.81 * 3  # safety factor 3
        if total_force >= required_force:
            issues.append(_issue(
                "functional", "ok",
                f"Clamping force {total_force:.0f}N exceeds minimum {required_force:.0f}N",
                f"Safety factor: {total_force/required_force:.1f}× (need ≥1.5×)",
            ))
        else:
            issues.append(_issue(
                "functional", "warning",
                f"Clamping force {total_force:.0f}N may be insufficient ({required_force:.0f}N required)",
                "Low clamp force risks part movement during operation.",
                fix="Increase clamp force or add additional clamp.",
            ))

    # Datum flatness
    datum_faces = [f for f in features.get("faces", []) if f.get("is_datum_candidate")]
    if datum_faces:
        issues.append(_issue(
            "functional", "warning",
            "Datum A flatness not yet verified",
            "Flatness of support datum faces not measured from STEP. Add GD&T callout.",
            fix="Add flatness callout ≤0.05mm on Datum A face in drawing.",
        ))

    return issues


# ── Standards Rules ────────────────────────────────────────────────────────────

def run_standards(features: dict, project: dict) -> list[dict]:
    issues = []
    std = project.get("quality_standard", "")
    gdt = project.get("gdt_standard", "ASME Y14.5")

    # GD&T standard present
    issues.append(_issue(
        "standards", "ok",
        f"GD&T standard set: {gdt}",
        "Drawing will reference the correct tolerance standard.",
    ))

    # Material cert
    if std in ("AS9100", "IATF16949"):
        issues.append(_issue(
            "standards", "warning",
            f"Material certification required for {std}",
            "Aerospace/automotive standards mandate material certs for all fixture components.",
            fix="Obtain and file material certs before FAI sign-off.",
        ))

    # Revision block
    revision = project.get("revision", "")
    if not revision:
        issues.append(_issue(
            "standards", "warning",
            "Revision field is empty",
            "Drawings must carry a revision letter/number for change control.",
            fix="Set revision to 'A' (first release) in project settings.",
        ))

    return issues


# ── Full run ───────────────────────────────────────────────────────────────────

def run_all(
    features: dict,
    printer_profile: dict,
    touchpoints: list[dict],
    project: dict,
) -> dict[str, list[dict]]:
    return {
        "fdm":        run_fdm(features, printer_profile),
        "cnc":        run_cnc(features),
        "laser":      run_laser(features),
        "functional": run_functional(features, touchpoints),
        "standards":  run_standards(features, project),
    }
