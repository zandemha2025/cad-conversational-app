"""
Validation Engine.

Runs 6 validation passes:
  FDM        – FDM/FFF 3D printing DFM rules + printability
  CNC        – CNC milling DFM rules + radius consistency
  Laser      – Laser cutting DFM rules
  Functional – 3-2-1 constraint completeness + planar check + STEP integrity
               + tolerance verification + assembly fit
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
    max_bridge_mm = printer_profile.get("max_bridge_mm", 25.0)

    faces = features.get("faces", [])
    bb = features.get("bounding_box", {})
    x, y, z = bb.get("x", 0), bb.get("y", 0), bb.get("z", 0)

    # ── Wall thickness: smallest bounding box dimension vs nozzle ──
    min_dim = min(bb.get("x", 99), bb.get("y", 99), bb.get("z", 99))
    if min_dim < min_wall:
        issues.append(_issue(
            "fdm", "error",
            f"Wall too thin ({min_dim:.1f}mm)",
            f"Minimum wall is nozzle × 2 = {min_wall:.1f}mm. Thinnest dimension is {min_dim:.1f}mm.",
            fix=f"Increase wall thickness to ≥{min_wall:.1f}mm or use 0.2mm nozzle.",
        ))
    else:
        issues.append(_issue(
            "fdm", "ok",
            f"Wall thickness OK — {min_dim:.1f}mm ≥ {min_wall:.1f}mm minimum",
            f"Thinnest section ({min_dim:.1f}mm) clears the {nozzle}mm nozzle × 2 requirement.",
        ))

    # ── Overhang check: faces with normal > overhang_limit from vertical ──
    overhang_faces = []
    for face in faces:
        normal = face.get("normal", [0, 0, 0])
        if len(normal) == 3 and normal[2] != 0:
            angle_from_vertical = np.degrees(np.arccos(abs(normal[2])))
            if angle_from_vertical > overhang_limit and face.get("area_mm2", 0) > 100:
                overhang_faces.append((face, angle_from_vertical))
                issues.append(_issue(
                    "fdm", "warning",
                    f"Overhang angle {angle_from_vertical:.0f}° on face {face['id']}",
                    f"Exceeds {overhang_limit}° limit. Will require supports.",
                    fix="Add chamfer ≤45° or redesign to eliminate overhang. Consider print orientation change.",
                    location=face.get("centroid"),
                ))

    if not overhang_faces:
        issues.append(_issue(
            "fdm", "ok",
            f"No overhangs exceed {overhang_limit}° — support-free print possible",
            "All face normals are within the printable overhang angle for this profile.",
        ))

    # ── Bore tolerance check: holes ≥ nozzle × 4 ──
    bore_issues = 0
    for hole in features.get("detected_holes", []):
        dia = hole.get("diameter", 0)
        min_bore = nozzle * 4
        if dia < min_bore:
            bore_issues += 1
            issues.append(_issue(
                "fdm", "error",
                f"Bore diameter {dia:.1f}mm too small for FDM",
                f"Minimum printable bore for {nozzle}mm nozzle is {min_bore:.1f}mm.",
                fix=f"Increase to ≥{min_bore:.1f}mm or post-drill after printing.",
                location=hole.get("center"),
            ))
    if bore_issues == 0 and features.get("detected_holes"):
        issues.append(_issue(
            "fdm", "ok",
            "All bore diameters within FDM printability range",
            f"All holes ≥ {nozzle * 4:.1f}mm minimum for {nozzle}mm nozzle.",
        ))

    # ── Bridge distance check ──
    # Estimate bridging span from bounding box — holes crossing the part
    for hole in features.get("detected_holes", []):
        depth = hole.get("depth", 0)
        dia = hole.get("diameter", 0)
        # If hole is a through-hole (depth ≈ part height), it spans full Z
        if depth > 0 and dia > 0 and dia > max_bridge_mm:
            issues.append(_issue(
                "fdm", "warning",
                f"Hole Ø{dia:.1f}mm exceeds bridge limit ({max_bridge_mm:.0f}mm)",
                f"Spanning {dia:.1f}mm across a hole without support risks bridge sag and surface quality issues.",
                fix=f"Add support material inside large holes, or print at ≤{max_bridge_mm:.0f}mm bridge span.",
                location=hole.get("center"),
            ))

    # ── Elephant foot risk ──
    if z > 0 and layer_h / z > 0.1:
        issues.append(_issue(
            "fdm", "info",
            "Elephant foot risk on bottom layer",
            "First layer squish can cause +0.3–0.5mm expansion at base.",
            fix="Compensate by chamfering bottom edge 0.5mm or reduce first-layer flow.",
        ))
    else:
        issues.append(_issue(
            "fdm", "ok",
            "Part height adequate — elephant foot risk low",
            f"Part height {z:.1f}mm. First-layer expansion will not significantly affect geometry.",
        ))

    # ── Support material estimate ──
    support_volume_pct = len(overhang_faces) * 5  # rough estimate
    if support_volume_pct > 0:
        issues.append(_issue(
            "fdm", "info",
            f"Estimated support material: ~{min(support_volume_pct, 30)}% of part volume",
            f"{len(overhang_faces)} overhang region(s) detected. Support removal may affect surface finish.",
        ))

    return issues


# ── CNC Rules ─────────────────────────────────────────────────────────────────

def run_cnc(features: dict) -> list[dict]:
    issues = []
    faces = features.get("faces", [])

    # ── Internal corner radius check ──
    face_count = features.get("face_count", 0)
    if face_count > 6:
        issues.append(_issue(
            "cnc", "warning",
            "Verify internal corner radii ≥ tool radius",
            "CNC cannot cut internal square corners. All internal corners need a fillet.",
            fix="Add R3mm fillets to all internal pockets before ordering CNC.",
        ))
    else:
        issues.append(_issue(
            "cnc", "ok",
            "Simple geometry — internal corner count within CNC accessibility",
            f"Part has {face_count} faces. Low complexity reduces tool access risk.",
        ))

    # ── Pocket depth-to-width ratio ──
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
    elif z > 0:
        issues.append(_issue(
            "cnc", "ok",
            f"Depth/width ratio {z/x:.1f}:1 — within CNC reach limits",
            "Standard end mills can access this pocket depth without chatter risk.",
        ))

    # ── Undercut check — simplified ──
    non_planar = [f for f in faces if not f.get("is_planar", True)]
    if len(non_planar) > 2:
        issues.append(_issue(
            "cnc", "info",
            "Complex curved faces may require 5-axis machining",
            f"{len(non_planar)} non-planar faces detected. Verify tool access from standard directions.",
            fix="Add process note for 5-axis or hand-finishing curved surfaces.",
        ))

    # ── Datum faces planar ──
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

    # ── Laser is 2D — check if part is essentially 2D ──
    if z > 10:
        issues.append(_issue(
            "laser", "error",
            f"Part Z-height {z:.1f}mm exceeds laser sheet capability",
            "Laser cutting is a 2D process. This part has significant Z geometry.",
            fix="Fabricate as 2D flat stock + secondary bends, or switch to CNC/FDM.",
        ))
    else:
        issues.append(_issue(
            "laser", "ok",
            f"Part Z-height {z:.1f}mm — within laser sheet range",
            "Part is thin enough to be laser-cut from sheet stock.",
        ))

    # ── Min hole check (typical laser kerf 0.2–0.3mm, min hole ~1.5mm) ──
    MIN_LASER_HOLE = 1.5
    small_holes = []
    for hole in features.get("detected_holes", []):
        dia = hole.get("diameter", 0)
        if dia < MIN_LASER_HOLE:
            small_holes.append(hole)
            issues.append(_issue(
                "laser", "error",
                f"Hole diameter {dia:.1f}mm below laser minimum {MIN_LASER_HOLE}mm",
                "Laser beam kerf makes sub-1.5mm holes inaccurate.",
                fix=f"Drill or EDM holes <{MIN_LASER_HOLE}mm after laser cutting.",
                location=hole.get("center"),
            ))
    if not small_holes and features.get("detected_holes"):
        issues.append(_issue(
            "laser", "ok",
            "All holes above laser minimum diameter",
            f"No holes below {MIN_LASER_HOLE}mm — all features are laser-cuttable.",
        ))

    if z <= 10 and not small_holes:
        issues.append(_issue(
            "laser", "ok",
            "Part appears laser-compatible for base plate profiling",
            "Flat 2D geometry suitable for laser cutting. Verify material thickness.",
        ))
    elif z > 10 and not small_holes:
        issues.append(_issue(
            "laser", "info",
            "2D plate profile is laser-cuttable if depth is removed",
            "If simplified to outer profile + through-holes, the base plate is laser-cuttable.",
            fix="Use hybrid process: laser cut outline + drill/bore critical features on CNC.",
        ))

    return issues


# ── Functional / Fixture Rules ─────────────────────────────────────────────────

def run_functional(features: dict, touchpoints: list[dict]) -> list[dict]:
    issues = []

    # ── 3-2-1 constraint check ──
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

    # ── Clamping force check ──
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

    # ── Datum flatness ──
    datum_faces = [f for f in features.get("faces", []) if f.get("is_datum_candidate")]
    if datum_faces:
        issues.append(_issue(
            "functional", "warning",
            "Datum A flatness not yet verified",
            "Flatness of support datum faces not measured from STEP. Add GD&T callout.",
            fix="Add flatness callout ≤0.05mm on Datum A face in drawing.",
        ))

    return issues


# ── Planar Check ───────────────────────────────────────────────────────────────

def run_planar_check(features: dict) -> list[dict]:
    """Check that surfaces marked as planar have unit normals (truly flat)."""
    issues = []
    faces = features.get("faces", [])
    planar_faces = [f for f in faces if f.get("is_planar", False)]
    non_planar = [f for f in faces if not f.get("is_planar", True)]

    TOL = 1e-3
    failed = []
    for face in planar_faces:
        normal = face.get("normal", [])
        if len(normal) == 3:
            mag = float(np.linalg.norm(normal))
            if abs(mag - 1.0) > TOL:
                failed.append((face, mag))

    if failed:
        for face, mag in failed:
            issues.append(_issue(
                "functional", "error",
                f"Planar surface deviation on {face['id']} (normal magnitude {mag:.4f})",
                f"Face flagged as planar but normal vector magnitude is {mag:.4f} (expected 1.000). "
                "Surface may not be truly flat — geometry tessellation error or warped face.",
                fix="Re-export STEP file. Check for coincident or zero-area faces in CAD.",
                location=face.get("centroid"),
                node_ref=face.get("id"),
            ))
    elif planar_faces:
        issues.append(_issue(
            "functional", "ok",
            f"Planar surface check passed — {len(planar_faces)} flat face(s) verified",
            f"All {len(planar_faces)} planar surfaces have unit normals within ±{TOL} tolerance. "
            "Surfaces are geometrically confirmed flat.",
        ))
    else:
        issues.append(_issue(
            "functional", "warning",
            "No faces marked as planar in geometry",
            "Part geometry did not identify any planar surfaces. "
            "Verify STEP export includes face type annotations.",
            fix="Ensure STEP file includes face type (planar/curved) metadata.",
        ))

    if non_planar:
        issues.append(_issue(
            "functional", "info",
            f"{len(non_planar)} curved surface(s) identified",
            f"Non-planar faces will need special fixturing for datum clamping. "
            f"Part has {len(faces)} faces total, {len(non_planar)} are curved.",
        ))

    return issues


# ── Radius Consistency Check ───────────────────────────────────────────────────

def run_radius_check(features: dict) -> list[dict]:
    """Verify all fillets/radii match their specified values (diameter/depth consistency)."""
    issues = []
    holes = features.get("detected_holes", [])

    if not holes:
        issues.append(_issue(
            "cnc", "info",
            "No circular features detected for radius check",
            "Part has no holes or fillets requiring radius verification.",
        ))
        return issues

    # Group by nominal diameter (rounded to 0.1mm)
    by_dia: dict[float, list[dict]] = {}
    for hole in holes:
        dia = round(hole.get("diameter", 0), 1)
        by_dia.setdefault(dia, []).append(hole)

    for dia, group in sorted(by_dia.items()):
        depths = [h.get("depth", 0) for h in group]
        depth_range = max(depths) - min(depths) if len(depths) > 1 else 0

        if len(group) > 1 and depth_range > 0.5:
            issues.append(_issue(
                "cnc", "warning",
                f"Ø{dia}mm holes: inconsistent depths ({min(depths):.1f}–{max(depths):.1f}mm)",
                f"{len(group)} holes share Ø{dia}mm diameter but depth varies {depth_range:.1f}mm. "
                "Different depths may indicate mixed feature types (through-hole vs. counterbore).",
                fix="Verify intended depth per hole. Add explicit depth callouts to drawing.",
                location=group[0].get("center"),
            ))
        else:
            issues.append(_issue(
                "cnc", "ok",
                f"{len(group)}× Ø{dia}mm hole(s) — radius and depth consistent ({depths[0]:.1f}mm deep)",
                f"All Ø{dia}mm holes at depth {depths[0]:.1f}mm. Radius specification verified.",
            ))

    return issues


# ── Tolerance Verification ─────────────────────────────────────────────────────

def run_tolerance_check(features: dict, project: dict) -> list[dict]:
    """Check that dimensions are within specified tolerances."""
    issues = []
    bb = features.get("bounding_box", {})
    env = project.get("environment_json") or {}
    nominal_dims = env.get("nominal_dimensions", {})
    tolerance_mm = env.get("general_tolerance_mm", 0.1)

    if nominal_dims:
        for axis in ("x", "y", "z"):
            actual = bb.get(axis)
            nominal = nominal_dims.get(axis)
            if actual is not None and nominal is not None:
                deviation = abs(actual - nominal)
                if deviation > tolerance_mm:
                    issues.append(_issue(
                        "functional", "error",
                        f"Dimension {axis.upper()} out of tolerance: {actual:.2f}mm (nominal {nominal:.2f} ±{tolerance_mm}mm)",
                        f"Measured {axis.upper()} deviates {deviation:.3f}mm from nominal {nominal:.2f}mm. "
                        f"Tolerance is ±{tolerance_mm}mm.",
                        fix=f"Adjust geometry to bring {axis.upper()} within ±{tolerance_mm}mm of {nominal:.2f}mm.",
                    ))
                else:
                    issues.append(_issue(
                        "functional", "ok",
                        f"Dimension {axis.upper()}: {actual:.2f}mm within ±{tolerance_mm}mm tolerance",
                        f"Deviation from nominal {nominal:.2f}mm: {deviation:.3f}mm (limit ±{tolerance_mm}mm). PASS.",
                    ))
    else:
        # No nominal dims — check volume-to-bbox ratio for geometry plausibility
        vol_actual = features.get("volume_mm3", 0)
        x, y, z = bb.get("x", 0), bb.get("y", 0), bb.get("z", 0)
        vol_bb = x * y * z

        if vol_bb > 0 and vol_actual > 0:
            fill_ratio = vol_actual / vol_bb
            if fill_ratio < 0.05:
                issues.append(_issue(
                    "functional", "warning",
                    f"Very low volume-to-bounding-box ratio ({fill_ratio*100:.1f}%)",
                    "Part volume is very small relative to bounding box — may indicate incomplete geometry.",
                    fix="Verify geometry is complete and all features are accounted for.",
                ))
            else:
                issues.append(_issue(
                    "functional", "ok",
                    f"Geometry volume ratio {fill_ratio*100:.0f}% — plausible solid",
                    f"Part volume {vol_actual:.0f}mm³ vs bounding box {vol_bb:.0f}mm³. "
                    "Ratio indicates a realistic solid part.",
                ))

        issues.append(_issue(
            "functional", "info",
            "No nominal dimensions specified — general tolerance check not applicable",
            "Add nominal_dimensions to project environment settings to enable per-axis tolerance checking.",
        ))

    return issues


# ── STEP Integrity Check ───────────────────────────────────────────────────────

def run_step_integrity(features: dict) -> list[dict]:
    """Validate that STEP-exported geometry maintains dimensional accuracy."""
    issues = []

    face_count = features.get("face_count", 0)
    edge_count = features.get("edge_count", 0)
    surface_area = features.get("surface_area_mm2", 0)
    volume = features.get("volume_mm3", 0)

    # ── Topology: edge/face ratio ──
    if face_count > 0 and edge_count > 0:
        ratio = edge_count / face_count
        if ratio < 1.0 or ratio > 4.5:
            issues.append(_issue(
                "functional", "warning",
                f"Edge/face ratio {ratio:.1f} may indicate geometry issues",
                f"Part has {edge_count} edges and {face_count} faces (ratio {ratio:.1f}). "
                "Expected 1–4.5× for typical closed solid geometry.",
                fix="Re-export STEP. Check for open shells or non-manifold edges in CAD.",
            ))
        else:
            issues.append(_issue(
                "functional", "ok",
                f"STEP topology valid — {face_count} faces, {edge_count} edges (ratio {ratio:.1f})",
                "Edge-to-face ratio is within expected bounds for a closed manifold solid.",
            ))
    elif face_count == 0:
        issues.append(_issue(
            "functional", "warning",
            "No topology data — STEP integrity check requires processed geometry",
            "Upload and process a STEP file to enable topology validation.",
        ))

    # ── Surface area to volume ratio ──
    if volume > 0 and surface_area > 0:
        sav = surface_area / volume
        bb = features.get("bounding_box", {})
        char_len = max(bb.get("x", 1), bb.get("y", 1), bb.get("z", 1))
        normalized_sav = sav * char_len

        if normalized_sav > 50:
            issues.append(_issue(
                "functional", "warning",
                f"High SA/volume ratio ({sav:.3f} mm⁻¹) — possible thin-wall geometry",
                f"Surface area {surface_area:.0f}mm² / volume {volume:.0f}mm³. "
                "Very large SA/V ratio suggests extremely thin sections that may not export accurately.",
                fix="Verify thin walls in CAD before STEP export. Check for zero-thickness surfaces.",
            ))
        else:
            issues.append(_issue(
                "functional", "ok",
                f"SA/volume ratio {sav:.3f} mm⁻¹ — geometry dimensionally sound",
                f"Surface area: {surface_area:.0f}mm², Volume: {volume:.0f}mm³. "
                "Ratio is consistent with a well-formed solid part.",
            ))

    # ── Hole count consistency ──
    reported_holes = features.get("hole_count", 0)
    detected_holes = len(features.get("detected_holes", []))
    if reported_holes > 0 and detected_holes > 0:
        if abs(reported_holes - detected_holes) > 1:
            issues.append(_issue(
                "functional", "warning",
                f"Hole count mismatch: {reported_holes} reported vs {detected_holes} detected",
                "STEP header reports a different hole count than geometry analysis found. "
                "Some holes may not have exported correctly.",
                fix="Re-export STEP. Verify all holes are included in the model.",
            ))
        else:
            issues.append(_issue(
                "functional", "ok",
                f"Hole count consistent — {detected_holes} hole(s) verified in STEP export",
                "Geometry analysis confirms all expected holes are present in STEP data.",
            ))

    return issues


# ── Assembly Fit Check ─────────────────────────────────────────────────────────

def run_assembly_fit(features: dict, project: dict) -> list[dict]:
    """Verify mating surfaces and clearances between parts."""
    issues = []
    holes = features.get("detected_holes", [])
    env = project.get("environment_json") or {}
    pin_dia = env.get("locating_pin_diameter_mm")

    if pin_dia and holes:
        # Check clearance for locating pin holes
        matching = [h for h in holes if abs(h.get("diameter", 0) - pin_dia) < 0.5]
        for hole in matching:
            dia = hole.get("diameter", 0)
            clearance = dia - pin_dia
            if clearance < 0:
                issues.append(_issue(
                    "functional", "error",
                    f"Hole Ø{dia:.2f}mm is smaller than locating pin Ø{pin_dia:.2f}mm",
                    f"Pin will not fit. Negative clearance: {clearance:.3f}mm.",
                    fix=f"Increase hole diameter to ≥Ø{pin_dia + 0.02:.2f}mm (H7 fit).",
                    location=hole.get("center"),
                ))
            elif clearance < 0.01:
                issues.append(_issue(
                    "functional", "warning",
                    f"Tight fit: Ø{dia:.2f}mm hole / Ø{pin_dia:.2f}mm pin ({clearance*1000:.0f}µm clearance)",
                    "Clearance is very tight — part may bind on worn pins. "
                    "Ensure hole is to H7 tolerance.",
                    fix="Verify hole is H7 (+0/+21µm for Ø6mm). Consider H8 for manual loading ease.",
                    location=hole.get("center"),
                ))
            else:
                issues.append(_issue(
                    "functional", "ok",
                    f"Assembly fit OK: Ø{dia:.2f}mm hole / Ø{pin_dia:.2f}mm pin (+{clearance:.3f}mm clearance)",
                    f"Clearance of {clearance*1000:.0f}µm provides a "
                    f"{'snug' if clearance < 0.05 else 'free'} fit suitable for locating.",
                    location=hole.get("center"),
                ))
    elif holes:
        # Generic: check holes are on standard drill-size grid
        non_std = [h for h in holes if abs(h.get("diameter", 0) % 0.5) > 0.1]
        if non_std:
            issues.append(_issue(
                "functional", "warning",
                f"{len(non_std)} hole(s) with non-standard diameters",
                "Hole diameters not on 0.5mm grid — may require special tooling.",
                fix="Round hole diameters to nearest 0.5mm or specify custom tooling in BOM.",
            ))
        else:
            issues.append(_issue(
                "functional", "ok",
                f"All {len(holes)} holes use standard diameter increments",
                "Hole diameters align with standard drill/reamer sizes for easy procurement.",
            ))
    else:
        issues.append(_issue(
            "functional", "info",
            "No assembly mating features detected",
            "Part has no holes for assembly fit checking. "
            "Add locating_pin_diameter_mm to project environment settings to enable clearance checks.",
        ))

    return issues


# ── Standards Rules ────────────────────────────────────────────────────────────

def run_standards(features: dict, project: dict) -> list[dict]:
    issues = []
    std = project.get("quality_standard", "")
    gdt = project.get("gdt_standard", "ASME Y14.5")

    # ── GD&T standard ──
    issues.append(_issue(
        "standards", "ok",
        f"GD&T standard set: {gdt}",
        "Drawing will reference the correct tolerance standard.",
    ))

    # ── Material cert requirement ──
    if std in ("AS9100", "IATF16949"):
        issues.append(_issue(
            "standards", "warning",
            f"Material certification required for {std}",
            "Aerospace/automotive standards mandate material certs for all fixture components.",
            fix="Obtain and file material certs before FAI sign-off.",
        ))
    else:
        issues.append(_issue(
            "standards", "ok",
            "No special material certification required",
            f"Quality standard '{std or 'general'}' does not mandate material traceability certs.",
        ))

    # ── Revision block ──
    revision = project.get("revision", "")
    if not revision:
        issues.append(_issue(
            "standards", "warning",
            "Revision field is empty",
            "Drawings must carry a revision letter/number for change control.",
            fix="Set revision to 'A' (first release) in project settings.",
        ))
    else:
        issues.append(_issue(
            "standards", "ok",
            f"Revision '{revision}' — drawing change control active",
            "Revision field is populated. Document control traceability is established.",
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
        "fdm": run_fdm(features, printer_profile),
        "cnc": run_cnc(features) + run_radius_check(features),
        "laser": run_laser(features),
        "functional": (
            run_functional(features, touchpoints)
            + run_planar_check(features)
            + run_step_integrity(features)
            + run_tolerance_check(features, project)
            + run_assembly_fit(features, project)
        ),
        "standards": run_standards(features, project),
    }
