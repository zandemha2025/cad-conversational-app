"""
Work instructions generator route.
POST /api/projects/{project_id}/work-instructions

Generates a complete shop-floor work instruction document based on the project's
material, geometry, and touchpoints. Cutting parameters are derived from the
Kienzle Kc values in MATERIAL_PROPERTIES.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from datetime import datetime, timezone
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["work-instructions"])

# Imported from clamping_force — same source of truth for material data.
# Duplicated here to keep services self-contained and avoid circular imports.
MATERIAL_PROPERTIES = {
    "aluminum_6061": {
        "display_name": "Aluminum 6061-T6",
        "yield_strength_mpa": 276,
        "hardness_hb": 95,
        "machinability_rating": 90,
        "kc1_1": 700,
        "mc": 0.27,
    },
    "aluminum_7075": {
        "display_name": "Aluminum 7075-T6",
        "yield_strength_mpa": 503,
        "hardness_hb": 150,
        "machinability_rating": 70,
        "kc1_1": 790,
        "mc": 0.26,
    },
    "mild_steel_1018": {
        "display_name": "Mild Steel 1018",
        "yield_strength_mpa": 370,
        "hardness_hb": 131,
        "machinability_rating": 78,
        "kc1_1": 1855,
        "mc": 0.26,
    },
    "steel_4140": {
        "display_name": "Steel 4140 (annealed)",
        "yield_strength_mpa": 655,
        "hardness_hb": 197,
        "machinability_rating": 55,
        "kc1_1": 2260,
        "mc": 0.25,
    },
    "stainless_304": {
        "display_name": "Stainless Steel 304",
        "yield_strength_mpa": 310,
        "hardness_hb": 215,
        "machinability_rating": 45,
        "kc1_1": 2500,
        "mc": 0.22,
    },
    "titanium_ti6al4v": {
        "display_name": "Titanium Ti-6Al-4V",
        "yield_strength_mpa": 880,
        "hardness_hb": 334,
        "machinability_rating": 22,
        "kc1_1": 3185,
        "mc": 0.20,
    },
    "inconel_718": {
        "display_name": "Inconel 718",
        "yield_strength_mpa": 1035,
        "hardness_hb": 363,
        "machinability_rating": 12,
        "kc1_1": 4275,
        "mc": 0.25,
    },
    "abs_plastic": {
        "display_name": "ABS Plastic",
        "yield_strength_mpa": 41,
        "hardness_hb": 10,
        "machinability_rating": 95,
        "kc1_1": 245,
        "mc": 0.30,
    },
    "peek_plastic": {
        "display_name": "PEEK",
        "yield_strength_mpa": 100,
        "hardness_hb": 25,
        "machinability_rating": 85,
        "kc1_1": 415,
        "mc": 0.28,
    },
    "cfrp_composite": {
        "display_name": "CFRP Composite",
        "yield_strength_mpa": 600,
        "hardness_hb": 45,
        "machinability_rating": 30,
        "kc1_1": 950,
        "mc": 0.20,
    },
}

_UNKNOWN_MATERIAL = {
    "display_name": "Unknown Material",
    "yield_strength_mpa": 350,
    "hardness_hb": 150,
    "machinability_rating": 60,
    "kc1_1": 1800,
    "mc": 0.26,
}

# Recommended cutting parameters from Sandvik Coromant / Kennametal application guides.
# Vc in m/min, feed in mm/tooth, for carbide tooling (uncoated to AlTiN coated).
CUTTING_SPEEDS = {
    "aluminum_6061":    {"roughing_vc": 300, "finishing_vc": 500, "feed_mm_tooth": 0.10, "doc_rough_mm": 3.0, "doc_finish_mm": 0.3},
    "aluminum_7075":    {"roughing_vc": 250, "finishing_vc": 400, "feed_mm_tooth": 0.08, "doc_rough_mm": 2.5, "doc_finish_mm": 0.3},
    "mild_steel_1018":  {"roughing_vc": 100, "finishing_vc": 150, "feed_mm_tooth": 0.06, "doc_rough_mm": 2.0, "doc_finish_mm": 0.2},
    "steel_4140":       {"roughing_vc":  60, "finishing_vc": 100, "feed_mm_tooth": 0.05, "doc_rough_mm": 1.5, "doc_finish_mm": 0.2},
    "stainless_304":    {"roughing_vc":  50, "finishing_vc":  80, "feed_mm_tooth": 0.04, "doc_rough_mm": 1.0, "doc_finish_mm": 0.15},
    "titanium_ti6al4v": {"roughing_vc":  40, "finishing_vc":  60, "feed_mm_tooth": 0.03, "doc_rough_mm": 0.8, "doc_finish_mm": 0.1},
    "inconel_718":      {"roughing_vc":  25, "finishing_vc":  40, "feed_mm_tooth": 0.02, "doc_rough_mm": 0.5, "doc_finish_mm": 0.08},
    "abs_plastic":      {"roughing_vc": 500, "finishing_vc": 800, "feed_mm_tooth": 0.15, "doc_rough_mm": 4.0, "doc_finish_mm": 0.5},
    "peek_plastic":     {"roughing_vc": 400, "finishing_vc": 600, "feed_mm_tooth": 0.12, "doc_rough_mm": 3.0, "doc_finish_mm": 0.4},
    "cfrp_composite":   {"roughing_vc": 200, "finishing_vc": 350, "feed_mm_tooth": 0.05, "doc_rough_mm": 1.5, "doc_finish_mm": 0.2},
}

_UNKNOWN_CUTTING = {"roughing_vc": 80, "finishing_vc": 120, "feed_mm_tooth": 0.05,
                    "doc_rough_mm": 1.5, "doc_finish_mm": 0.2}

# Setup and run time estimates (minutes) indexed by machinability band
def _estimate_times(machinability_rating: int) -> tuple[int, int]:
    """Return (setup_time_min, run_time_per_part_min)."""
    if machinability_rating >= 80:   # aluminium, plastics
        return 35, 15
    elif machinability_rating >= 50:  # mild steel
        return 45, 22
    elif machinability_rating >= 30:  # alloy steel, stainless
        return 55, 35
    else:                             # titanium, inconel, CFRP
        return 70, 60


def _is_plastic_or_composite(material_key: str) -> bool:
    return material_key in ("abs_plastic", "peek_plastic", "cfrp_composite")


def _requires_coolant(material_key: str) -> bool:
    return material_key not in ("abs_plastic", "cfrp_composite")


def _build_steps(
    mat_key: str,
    mat: dict,
    cuts: dict,
    part_number: str,
    dims: dict,
    touchpoint_counts: dict,
) -> list[dict]:
    """
    Build the work instruction step list dynamically based on material and project data.
    """
    lx = dims.get("length_mm", 0)
    ly = dims.get("width_mm", 0)
    lz = dims.get("height_mm", 0)
    display = mat["display_name"]
    coolant = "Flood coolant (water-soluble)" if _requires_coolant(mat_key) else "Dry / compressed air only (no coolant)"
    plastic = _is_plastic_or_composite(mat_key)

    steps = [
        {
            "step_number": 1,
            "phase": "incoming_inspection",
            "title": "Incoming Material Inspection",
            "description": "Verify raw stock dimensions and material certification before machining.",
            "details": [
                f"Verify material cert: alloy={display}, temper per engineering drawing",
                f"Check raw stock: Length ≥ {lx:.1f}mm, Width ≥ {ly:.1f}mm, Height ≥ {lz:.1f}mm (add 2–3mm per face for cleanup)",
                "Inspect for cracks, inclusions, porosity, or surface damage — reject if found",
                "Record heat number / lot number in traveler",
                "Verify cert against purchase order — no cert = no machining",
            ],
            "tools_required": ["Digital calipers (0.01mm resolution)", "Surface plate", "Straightedge"],
            "go_nogo_criteria": "Reject if dims < nominal + allowance, or cert missing / mismatched",
            "estimated_time_min": 10,
        },
        {
            "step_number": 2,
            "phase": "machine_setup",
            "title": "CNC Machine Setup",
            "description": "Prepare the 3-axis VMC: load tools, set offsets, warm up spindle.",
            "details": [
                "Load tooling per tooling list (see below) — verify tool numbers against program header",
                "Set tool length offsets using tool presetter or on-machine probe",
                "Verify spindle runout < 0.005mm TIR using dial indicator",
                f"Run spindle warm-up: 500 → 1000 → {cuts['roughing_vc'] * 1000 // (3 * 25):.0f} RPM, 5 min each",
                "Set work coordinate system (G54) using edge finder or probe cycle",
                "Load CNC program — verify program number and revision letter",
                "Perform dry-run (single-block, feed override 10%) — confirm no collisions",
            ],
            "tools_required": ["Tool presetter or on-machine probe", "Dial indicator + magnetic base", "Edge finder or 3D taster probe"],
            "go_nogo_criteria": "Do not start cutting if spindle runout > 0.005mm or dry-run shows any alarm",
            "estimated_time_min": 20,
        },
        {
            "step_number": 3,
            "phase": "datum_setup",
            "title": "Workpiece Datum Setup (3-2-1 Locating)",
            "description": "Mount workpiece in fixture per 3-2-1 locating scheme. Establish datums A, B, C.",
            "details": [
                f"Place {touchpoint_counts.get('support', 3)} support pads (Datum A — primary plane, Z-axis)",
                f"Locate against {touchpoint_counts.get('locating', 2)} locating pins (Datum B — X-axis stop, Datum C — Y-axis stop)",
                "Seat workpiece firmly — no rocking; check with feeler gauge (0.02mm limit)",
                f"Apply {touchpoint_counts.get('clamping', 2)} clamps per fixture drawing — torque to spec",
                "Re-check datum contact after clamping (feeler gauge) — part should not lift off pads",
                "Zero part probe cycle to confirm WCS origin within ±0.02mm",
            ],
            "tools_required": [
                "Feeler gauge set (0.02mm resolution)",
                "Torque wrench (calibrated)",
                "Dial indicator (0.001mm resolution)",
            ],
            "go_nogo_criteria": "All datum faces seated; no gap > 0.02mm under any clamp pad",
            "estimated_time_min": 10,
        },
        {
            "step_number": 4,
            "phase": "rough_machining",
            "title": "Rough Machining",
            "description": f"Remove bulk material leaving 0.3–0.5mm finish allowance on all surfaces. {coolant}.",
            "details": [
                f"Cutting speed: Vc = {cuts['roughing_vc']} m/min",
                f"Feed per tooth: fz = {cuts['feed_mm_tooth']:.3f} mm/tooth",
                f"Axial depth of cut: ap = {cuts['doc_rough_mm']:.1f} mm",
                "Radial width: ae ≤ 50% tool diameter (climb milling preferred)",
                f"{'Dry cut — no coolant. Use compressed air to clear chips.' if not _requires_coolant(mat_key) else 'Flood coolant ON before spindle start. Verify flow.'}",
                "Leave 0.3–0.5mm stock on all finished faces for semi-finish / finish passes",
                "Monitor tool wear every 30 min — replace at first sign of chatter or discolouration",
                "Check part temperature after rough — allow to cool to ambient before finish",
            ],
            "tools_required": [
                f"{'Carbide end mill (2-flute, sharp, uncoated)' if plastic else 'AlTiN-coated carbide end mill (4-flute)'}",
                "Chip brush / compressed air",
            ],
            "go_nogo_criteria": "No chatter; chip colour within expected range; no tool breakage alarm",
            "estimated_time_min": 20,
        },
        {
            "step_number": 5,
            "phase": "finish_machining",
            "title": "Finish Machining",
            "description": "Finish all surfaces to drawing dimensions and Ra specification.",
            "details": [
                f"Cutting speed: Vc = {cuts['finishing_vc']} m/min",
                f"Feed per tooth: fz = {cuts['feed_mm_tooth'] * 0.6:.3f} mm/tooth (reduced 40% vs roughing)",
                f"Axial depth of cut: ap = {cuts['doc_finish_mm']:.2f} mm",
                "Radial width: ae ≤ 10% tool diameter for wall finish passes",
                "Use a fresh tool (or verified-sharp tool) for finish passes",
                "Measure critical dimensions after first finish pass — adjust offsets as needed",
                "Target surface finish: Ra ≤ 1.6μm (N7) for mating faces, Ra ≤ 3.2μm (N8) for general",
            ],
            "tools_required": [
                f"{'Carbide end mill (2-flute, polished flutes)' if plastic else 'AlTiN or TiN-coated carbide end mill (4-flute, variable helix)'}",
                "Digital calipers / micrometer",
            ],
            "go_nogo_criteria": "All dims within tolerance per drawing; Ra verified at spot-check locations",
            "estimated_time_min": 15,
        },
        {
            "step_number": 6,
            "phase": "deburring",
            "title": "Deburring and Edge Break",
            "description": "Remove all machining burrs. Break sharp edges per drawing callout.",
            "details": [
                "Remove burrs from all machined edges using hand file, deburr tool, or abrasive pad",
                "Break sharp edges: 0.1–0.3mm chamfer or blend radius unless otherwise specified",
                "Pay special attention to: threaded holes (thread chaser), drilled holes (countersink), slots (file or rotary burr)",
                "Inspect all holes for burrs with bore light or pick — no burrs retained",
                "Clean part with isopropyl alcohol (IPA) wipe — remove all chips and coolant residue",
                "Inspect visually under inspection light for scratches, nicks, or damage",
            ],
            "tools_required": [
                "Hand file set (fine/medium)",
                "Deburring tool (Noga or similar)",
                "Abrasive pads (Scotch-Brite 7447)",
                "IPA wipe cloths",
                "Bore light",
            ],
            "go_nogo_criteria": "No burrs detectable by white-glove drag test; all edges broken",
            "estimated_time_min": 10,
        },
        {
            "step_number": 7,
            "phase": "final_inspection",
            "title": "Final Dimensional Inspection",
            "description": "Verify all critical dimensions per drawing before releasing part.",
            "details": [
                "Clean part thoroughly before measuring",
                "Allow part to reach thermal equilibrium (20°C ± 2°C) — minimum 30 min soak",
                "Measure all critical dimensions per QC checklist (see attached)",
                "Check surface finish at callout locations with profilometer (Ra, Rz)",
                "Verify all threaded holes: use calibrated go/no-go thread gauges",
                f"Final visual inspection: no scratches deeper than 0.05mm, no corrosion (esp. {display})",
                "Complete traveler: sign off each operation; record measured values",
                "Apply part ID tag / laser etch per traveler instructions",
            ],
            "tools_required": [
                "Digital calipers (0.01mm) — calibrated, in-date",
                "Outside micrometer (0.001mm)",
                "Thread plug gauges (go/no-go)",
                "Surface profilometer (Ra)",
                "CMM (for GD&T callouts)",
            ],
            "go_nogo_criteria": "All dims within tolerance; traveler fully signed off; no open NCRs",
            "estimated_time_min": 15,
        },
    ]
    return steps


def _build_tooling_list(mat_key: str, plastic: bool) -> list[dict]:
    coating = "Uncoated (sharp)" if plastic else "AlTiN or TiN coated"
    return [
        {
            "tool_number": "T01",
            "description": f"End mill, 12mm dia, 4-flute, {coating}",
            "application": "Roughing — bulk material removal",
            "material": "Carbide",
        },
        {
            "tool_number": "T02",
            "description": f"End mill, 8mm dia, 4-flute, {coating}, variable helix",
            "application": "Finish machining — walls and floors",
            "material": "Carbide",
        },
        {
            "tool_number": "T03",
            "description": "Face mill, 50mm dia, 4 inserts",
            "application": "Datum face preparation",
            "material": "Carbide inserts",
        },
        {
            "tool_number": "T04",
            "description": "Centre drill, 3mm dia",
            "application": "Drill start point",
            "material": "HSS",
        },
        {
            "tool_number": "T05",
            "description": "Drill, 6.8mm dia (for M8 tapped holes)",
            "application": "Drilling",
            "material": "Carbide" if not plastic else "HSS",
        },
        {
            "tool_number": "T06",
            "description": "M8 spiral-flute tap",
            "application": "Threading",
            "material": "HSS-E (cobalt)",
        },
    ]


def _build_safety_notes(mat_key: str) -> list[str]:
    notes = [
        "Wear safety glasses and steel-toe footwear at all times in the machine shop.",
        "Never reach into the machine envelope while spindle is live.",
        "Verify E-stop function before first part.",
    ]
    if mat_key == "titanium_ti6al4v":
        notes += [
            "Titanium chips are highly flammable — never allow dry chip accumulation. Maintain continuous flood coolant.",
            "Use Class D fire extinguisher near machine when machining titanium.",
            "Do NOT use water or CO2 on titanium fires.",
        ]
    elif mat_key == "inconel_718":
        notes += [
            "Inconel work-hardens rapidly — maintain consistent feed to avoid rubbing and work hardening.",
            "Inspect tool every pass for edge build-up (BUE). Replace immediately if detected.",
        ]
    elif mat_key == "cfrp_composite":
        notes += [
            "CFRP dust is a respiratory hazard — machine under local exhaust ventilation (LEV).",
            "Wear FFP3 respirator and nitrile gloves when handling CFRP parts and chips.",
            "No coolant — dry cut with compressed air directed away from operator.",
        ]
    elif mat_key in ("abs_plastic", "peek_plastic"):
        notes += [
            "Plastics can melt if feed/speed are too low — maintain minimum feed to keep cutting.",
            "No coolant — use compressed air to clear chips and prevent heat build-up.",
        ]
    elif mat_key == "stainless_304":
        notes += [
            "Stainless work-hardens — avoid tool dwell. Keep feed > 0.03mm/tooth at all times.",
            "Use sulphurised cutting oil or high-pressure coolant to prevent galling.",
        ]
    return notes


class WorkInstructionsRequest(BaseModel):
    part_number: Optional[str] = None
    revision: str = "A"
    # Override geometry if not in project (mm)
    length_mm: Optional[float] = None
    width_mm: Optional[float] = None
    height_mm: Optional[float] = None
    material: Optional[str] = None  # override project material if supplied


@router.post("/{project_id}/work-instructions")
async def generate_work_instructions(
    project_id: str,
    body: WorkInstructionsRequest | None = None,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate a complete shop-floor work instruction document for a project.

    Pulls material and geometry from the project record; cutting parameters are
    derived from the Kienzle Kc database and Sandvik/Kennametal application guides.
    """
    sb = get_supabase_client()

    proj_res = (
        sb.table("projects")
        .select("id,name,part_number,revision,environment_json")
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not proj_res.data:
        raise HTTPException(404, "Project not found")

    proj = proj_res.data[0]
    env = proj.get("environment_json") or {}
    body = body or WorkInstructionsRequest()

    # Resolve material: body override > project environment > default
    raw_material = (body.material or env.get("material") or "aluminum_6061")
    mat_key = raw_material.lower().replace(" ", "_").replace("-", "_")
    mat = MATERIAL_PROPERTIES.get(mat_key, _UNKNOWN_MATERIAL)
    cuts = CUTTING_SPEEDS.get(mat_key, _UNKNOWN_CUTTING)

    # Resolve geometry: body override > project environment > default 100mm cube
    dims = {
        "length_mm": body.length_mm or env.get("length_mm") or 100.0,
        "width_mm":  body.width_mm  or env.get("width_mm")  or 100.0,
        "height_mm": body.height_mm or env.get("height_mm") or 50.0,
    }

    # Fetch touchpoint counts
    tp_res = (
        sb.table("touchpoints")
        .select("type")
        .eq("project_id", project_id)
        .execute()
    )
    touchpoint_counts = {"support": 3, "locating": 2, "clamping": 2}
    if tp_res.data:
        touchpoint_counts = {
            "support":  sum(1 for t in tp_res.data if t.get("type") == "support"),
            "locating": sum(1 for t in tp_res.data if t.get("type") == "locating"),
            "clamping": sum(1 for t in tp_res.data if t.get("type") == "clamping"),
        }
        # Ensure at least 1 of each so instructions are always valid
        touchpoint_counts = {k: max(v, 1) for k, v in touchpoint_counts.items()}

    part_number = body.part_number or proj.get("part_number") or "TBD"
    revision = body.revision or proj.get("revision") or "A"
    setup_time, run_time = _estimate_times(mat["machinability_rating"])
    plastic = _is_plastic_or_composite(mat_key)

    steps = _build_steps(mat_key, mat, cuts, part_number, dims, touchpoint_counts)
    tooling = _build_tooling_list(mat_key, plastic)
    safety = _build_safety_notes(mat_key)

    return {
        "project_id": project_id,
        "project_name": proj.get("name", ""),
        "part_number": part_number,
        "revision": revision,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "machine_type": "3-axis CNC VMC",
        "setup_time_estimate_min": setup_time,
        "run_time_estimate_min_per_part": run_time,
        "material": mat["display_name"],
        "steps": steps,
        "tooling_list": tooling,
        "cutting_parameters": {
            "material": mat["display_name"],
            "kc1_1_n_mm2": mat["kc1_1"],
            "mc_exponent": mat["mc"],
            "roughing_vc_m_min": cuts["roughing_vc"],
            "finishing_vc_m_min": cuts["finishing_vc"],
            "feed_per_tooth_mm": cuts["feed_mm_tooth"],
            "roughing_depth_of_cut_mm": cuts["doc_rough_mm"],
            "finishing_depth_of_cut_mm": cuts["doc_finish_mm"],
            "coolant": "Flood (water-soluble)" if _requires_coolant(mat_key) else "Dry / compressed air",
            "machinability_rating_pct": mat["machinability_rating"],
        },
        "safety_notes": safety,
    }
