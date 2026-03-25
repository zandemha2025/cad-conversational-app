"""
QC checklist generator route.
POST /api/projects/{project_id}/qc-checklist

Generates a complete first-article / in-process inspection checklist referencing
ASME Y14.5-2018 (GD&T) and ASME B89 (measurement methods).
Inspection instruments and methods are selected based on material and feature type.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from datetime import datetime, timezone
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["qc-checklist"])

# Material-driven surface finish requirements (Ra in μm)
# Tighter finish for hard, difficult-to-machine alloys is typical
SURFACE_FINISH_TARGETS = {
    "aluminum_6061":    {"general_ra": 3.2, "mating_ra": 1.6, "note": "N8/N7"},
    "aluminum_7075":    {"general_ra": 3.2, "mating_ra": 1.6, "note": "N8/N7"},
    "mild_steel_1018":  {"general_ra": 3.2, "mating_ra": 1.6, "note": "N8/N7"},
    "steel_4140":       {"general_ra": 1.6, "mating_ra": 0.8, "note": "N7/N6"},
    "stainless_304":    {"general_ra": 1.6, "mating_ra": 0.8, "note": "N7/N6"},
    "titanium_ti6al4v": {"general_ra": 1.6, "mating_ra": 0.8, "note": "N7/N6"},
    "inconel_718":      {"general_ra": 0.8, "mating_ra": 0.4, "note": "N6/N5"},
    "abs_plastic":      {"general_ra": 3.2, "mating_ra": 1.6, "note": "N8/N7"},
    "peek_plastic":     {"general_ra": 1.6, "mating_ra": 0.8, "note": "N7/N6"},
    "cfrp_composite":   {"general_ra": 3.2, "mating_ra": 1.6, "note": "N8/N7"},
}

_DEFAULT_FINISH = {"general_ra": 3.2, "mating_ra": 1.6, "note": "N8/N7"}


def _build_dimensional_checks(dims: dict, part_number: str) -> list[dict]:
    """
    Generate dimensional check items from part geometry.
    Tolerances follow ASME Y14.5-2018 general machining tolerances for CNC work.
    """
    lx = dims.get("length_mm", 100.0)
    ly = dims.get("width_mm", 100.0)
    lz = dims.get("height_mm", 50.0)

    # General tolerance: ±0.10mm linear, ±0.05mm critical, as typical CNC print callout
    checks = [
        {
            "item_number": "D-001",
            "dimension": "Overall Length (X)",
            "nominal_mm": lx,
            "tolerance_mm": "±0.10",
            "instrument": "Digital calipers, resolution 0.01mm (ASME B89.1.14)",
            "method": "Measure along X-axis from Datum A face to opposite face. Three measurements — max, min, centre.",
            "accept_range": f"{lx - 0.10:.3f} to {lx + 0.10:.3f} mm",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "D-002",
            "dimension": "Overall Width (Y)",
            "nominal_mm": ly,
            "tolerance_mm": "±0.10",
            "instrument": "Digital calipers, resolution 0.01mm (ASME B89.1.14)",
            "method": "Measure along Y-axis from Datum B face to opposite face. Three measurements.",
            "accept_range": f"{ly - 0.10:.3f} to {ly + 0.10:.3f} mm",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "D-003",
            "dimension": "Overall Height (Z)",
            "nominal_mm": lz,
            "tolerance_mm": "±0.05",
            "instrument": "Outside micrometer 0–25mm or 25–50mm, resolution 0.001mm (ASME B89.1.7)",
            "method": "Measure height at four corners and centre. Record all five values.",
            "accept_range": f"{lz - 0.05:.3f} to {lz + 0.05:.3f} mm",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "D-004",
            "dimension": "Datum A Flatness",
            "nominal_mm": 0.0,
            "tolerance_mm": "0.05 (flatness zone)",
            "instrument": "CMM or surface plate + dial indicator (0.001mm)",
            "method": "Place on surface plate. Probe / indicate at minimum 9 points in 3×3 grid per ASME B89.3.1.",
            "accept_range": "All points within 0.05mm flatness zone",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "D-005",
            "dimension": "Perpendicularity — Side Wall to Datum A",
            "nominal_mm": 0.0,
            "tolerance_mm": "0.05 per 100mm",
            "instrument": "CMM or precision square + dial indicator",
            "method": "Set part on datum A. Probe side wall at top and bottom. Calculate angular deviation per ASME Y14.5-2018 §10.",
            "accept_range": "Angular deviation < 0.05mm per 100mm height",
            "actual_measured": None,
            "pass_fail": None,
        },
    ]
    return checks


def _build_surface_finish_checks(mat_key: str, finish: dict) -> list[dict]:
    return [
        {
            "item_number": "SF-001",
            "surface": "Datum A (primary locating face)",
            "nominal_ra_um": finish["mating_ra"],
            "tolerance": f"Ra ≤ {finish['mating_ra']}μm ({finish['note'].split('/')[1]})",
            "instrument": "Contact profilometer, tip radius 2μm, cutoff λc = 0.8mm (ISO 4288)",
            "method": "Measure 3 traces in orthogonal directions. Report Ra, Rz. Per ASME B46.1.",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "SF-002",
            "surface": "General machined faces",
            "nominal_ra_um": finish["general_ra"],
            "tolerance": f"Ra ≤ {finish['general_ra']}μm ({finish['note'].split('/')[0]})",
            "instrument": "Contact profilometer or optical profilometer",
            "method": "Spot-check 3 locations per face. Report Ra average.",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "SF-003",
            "surface": "Bore / hole internal surfaces",
            "nominal_ra_um": finish["mating_ra"],
            "tolerance": f"Ra ≤ {finish['mating_ra']}μm",
            "instrument": "Bore profilometer or portable surface tester with bore stylus attachment",
            "method": "Insert stylus. Measure at 0° and 90° orientations. Report Ra.",
            "actual_measured": None,
            "pass_fail": None,
        },
    ]


def _build_gdt_checks() -> list[dict]:
    return [
        {
            "item_number": "GDT-001",
            "characteristic": "Flatness — Datum A",
            "tolerance_symbol": "⏥",
            "tolerance_value": "0.05mm",
            "datum_reference": "—",
            "instrument": "CMM (Brown & Sharpe / Renishaw) or surface plate + dial gauge",
            "method": "CMM: probe 9-point grid, fit plane, calculate peak-to-valley. Per ASME Y14.5-2018 §12.4.",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "GDT-002",
            "characteristic": "Parallelism — Top Face to Datum A",
            "tolerance_symbol": "∥",
            "tolerance_value": "0.05mm",
            "datum_reference": "A",
            "instrument": "CMM or surface plate + height gauge",
            "method": "Set datum A on surface plate. Sweep height gauge across top face. Max–min = parallelism error. Per ASME Y14.5-2018 §11.7.",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "GDT-003",
            "characteristic": "Perpendicularity — Side B to Datum A",
            "tolerance_symbol": "⊥",
            "tolerance_value": "0.05mm per 50mm",
            "datum_reference": "A",
            "instrument": "CMM or precision square (grade 0) + dial indicator",
            "method": "CMM: probe side face, calculate normal vector deviation from A. Per ASME Y14.5-2018 §11.6.",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "GDT-004",
            "characteristic": "True Position — Primary Hole Pattern",
            "tolerance_symbol": "⊕",
            "tolerance_value": "ø0.10mm (MMC)",
            "datum_reference": "A | B | C",
            "instrument": "CMM (mandatory for position callouts per ASME B89.4)",
            "method": "Probe hole centre at full depth. Calculate 2D deviation from true position. Apply MMC bonus if applicable.",
            "actual_measured": None,
            "pass_fail": None,
        },
        {
            "item_number": "GDT-005",
            "characteristic": "Cylindricity — Primary Bore",
            "tolerance_symbol": "⌭",
            "tolerance_value": "0.02mm",
            "datum_reference": "—",
            "instrument": "CMM (roundness probe) or air gauge / bore gauge",
            "method": "Probe bore at 3 cross-sections, 8 points each. Fit minimum-zone cylinder. Per ASME Y14.5-2018 §12.7.",
            "actual_measured": None,
            "pass_fail": None,
        },
    ]


def _build_functional_checks(mat_key: str) -> list[dict]:
    checks = [
        {
            "item_number": "FC-001",
            "check": "Thread gauge — all tapped holes",
            "description": "Verify thread form and pitch with calibrated go/no-go plug gauge",
            "instrument": "Thread plug gauge (go/no-go), calibrated per ASME B1.2",
            "method": "Go gauge must pass full depth. No-go gauge must not enter beyond 2 turns.",
            "accept_criteria": "Go: passes full thread depth. No-go: does not engage.",
            "actual_result": None,
            "pass_fail": None,
        },
        {
            "item_number": "FC-002",
            "check": "Edge break / deburr",
            "description": "All sharp edges broken; no burrs detectable",
            "instrument": "White cotton glove drag test; 5× loupe magnifier",
            "method": "Drag glove across all edges — no snagging. Inspect under 5× magnifier.",
            "accept_criteria": "No burrs; all edges broken 0.1–0.5mm or per drawing callout",
            "actual_result": None,
            "pass_fail": None,
        },
        {
            "item_number": "FC-003",
            "check": "Cleanliness",
            "description": "No chips, coolant residue, or contamination on part",
            "instrument": "Visual inspection; white cotton swab",
            "method": "Wipe with clean cotton swab — no metallic particles or discolouration.",
            "accept_criteria": "Swab remains clean; no visible contamination",
            "actual_result": None,
            "pass_fail": None,
        },
    ]
    if mat_key in ("stainless_304", "titanium_ti6al4v", "inconel_718"):
        checks.append({
            "item_number": "FC-004",
            "check": "Surface contamination / smear layer",
            "description": "Verify no embedded abrasive or iron contamination (critical for corrosion-resistant alloys)",
            "instrument": "Ferroxyl test (stainless) or white cloth wipe",
            "method": "Apply ferroxyl reagent to cleaned surface. No blue spots within 60 seconds. Per ASTM A380.",
            "accept_criteria": "No blue colour change (ferroxyl negative = no free iron)",
            "actual_result": None,
            "pass_fail": None,
        })
    return checks


def _build_documentation_checks(mat_key: str) -> list[dict]:
    checks = [
        {"item": "Material Certificate (MTR / CoC)", "required": True,
         "detail": "Heat/lot number on cert must match traveler. Cert must show alloy, temper, and mechanical properties."},
        {"item": "First Article Inspection Report (FAIR / AS9102)", "required": True,
         "detail": "All drawing dimensions measured and recorded on Form 1/2/3 per AS9102B."},
        {"item": "Traveler signed off by all operations", "required": True,
         "detail": "Each operation sign-off block complete. No open hold tags."},
        {"item": "Nonconformance Report (NCR) — none open", "required": True,
         "detail": "Any open NCRs must be dispositioned before shipment."},
        {"item": "Dimensional report (QC sign-off)", "required": True,
         "detail": "QC inspector signature and stamp on inspection record."},
        {"item": "Customer purchase order number on traveler", "required": True,
         "detail": "PO number and line item traceable to this part."},
    ]
    if mat_key in ("titanium_ti6al4v", "inconel_718", "steel_4140"):
        checks.append({
            "item": "Special process certifications (heat treat, surface treat)",
            "required": True,
            "detail": "If heat treatment or coating specified, include processor cert with time/temp records.",
        })
    if mat_key == "cfrp_composite":
        checks.append({
            "item": "Ply stacking sequence record",
            "required": True,
            "detail": "Laminate layup record showing ply orientation and cure cycle per material spec.",
        })
    return checks


class QcChecklistRequest(BaseModel):
    part_number: Optional[str] = None
    revision: str = "A"
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    material: Optional[str] = None  # override project material if supplied
    quality_standard: Optional[str] = None  # override project quality_standard


@router.post("/{project_id}/qc-checklist")
async def generate_qc_checklist(
    project_id: str,
    body: QcChecklistRequest | None = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate a complete dimensional and functional inspection checklist.

    References ASME Y14.5-2018 (GD&T), ASME B89 (measurement methods),
    ASME B46.1 (surface texture), and AS9100D / AS9102B (aerospace quality).
    """
    sb = get_supabase_client()

    proj_res = (
        sb.table("projects")
        .select("id,name,part_number,revision,environment_json,quality_standard,gdt_standard")
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not proj_res.data:
        raise HTTPException(404, "Project not found")

    proj = proj_res.data[0]
    env = proj.get("environment_json") or {}
    body = body or QcChecklistRequest()

    raw_material = body.material or env.get("material") or "aluminum_6061"
    mat_key = raw_material.lower().replace(" ", "_").replace("-", "_")

    dims = {
        "length_mm": body.length_mm or env.get("length_mm") or 100.0,
        "width_mm":  body.width_mm  or env.get("width_mm")  or 100.0,
        "height_mm": body.height_mm or env.get("height_mm") or 50.0,
    }

    part_number = body.part_number or proj.get("part_number") or "TBD"
    revision = body.revision or proj.get("revision") or "A"
    quality_standard = (
        body.quality_standard
        or proj.get("quality_standard")
        or "AS9100D"
    )
    gdt_standard = proj.get("gdt_standard") or "ASME Y14.5-2018"

    finish = SURFACE_FINISH_TARGETS.get(mat_key, _DEFAULT_FINISH)

    dim_checks = _build_dimensional_checks(dims, part_number)
    sf_checks = _build_surface_finish_checks(mat_key, finish)
    gdt_checks = _build_gdt_checks()
    func_checks = _build_functional_checks(mat_key)
    doc_checks = _build_documentation_checks(mat_key)

    total_items = (
        len(dim_checks) + len(sf_checks) + len(gdt_checks)
        + len(func_checks) + len(doc_checks)
    )

    # Build frontend-compatible flat "items" array from categorised checks
    def _to_item(raw: dict, category: str) -> dict:
        return {
            "id": raw.get("item_number") or raw.get("check_id") or raw.get("check_number", "—"),
            "category": category,
            "characteristic": (
                raw.get("dimension") or raw.get("surface") or raw.get("characteristic") or
                raw.get("check_description") or raw.get("requirement") or raw.get("item", "—")
            ),
            "nominal": str(raw.get("nominal_mm") or raw.get("nominal_ra_um") or raw.get("nominal") or "—"),
            "tolerance": str(raw.get("tolerance_mm") or raw.get("tolerance") or "—"),
            "method": raw.get("method", "—"),
            "instrument": raw.get("instrument", "—"),
            "frequency": "100%",
            "accept_criteria": raw.get("accept_range") or raw.get("accept_criteria") or "Per drawing",
            "reference": gdt_standard,
        }

    items = (
        [_to_item(c, "Dimensional") for c in dim_checks] +
        [_to_item(c, "Surface Finish") for c in sf_checks] +
        [_to_item(c, "GD&T") for c in gdt_checks] +
        [_to_item(c, "Functional") for c in func_checks] +
        [_to_item(c, "Documentation") for c in doc_checks]
    )

    return {
        "project_id": project_id,
        "project_name": proj.get("name", ""),
        "checklist_title": f"Final Inspection Checklist — {part_number} Rev {revision}",
        "part_number": part_number,
        "revision": revision,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "standard": gdt_standard,
        "inspection_standard": gdt_standard,
        "quality_standard": quality_standard,
        "measurement_standard": "ASME B89 series",
        "surface_texture_standard": "ASME B46.1",
        "total_check_items": total_items,
        "summary": (
            f"{total_items} inspection items across {len(dim_checks)} dimensional, "
            f"{len(sf_checks)} surface finish, {len(gdt_checks)} GD&T, "
            f"{len(func_checks)} functional, {len(doc_checks)} documentation checks. "
            f"Standard: {gdt_standard}."
        ),
        "items": items,
        "dimensional_checks": dim_checks,
        "surface_finish_checks": sf_checks,
        "gdt_checks": gdt_checks,
        "functional_checks": func_checks,
        "documentation_checks": doc_checks,
    }
