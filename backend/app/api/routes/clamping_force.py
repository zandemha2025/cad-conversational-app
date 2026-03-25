"""
Clamping force calculator route.
POST /api/projects/{id}/clamping-force
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
import math
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["clamping-force"])

# Material-specific cutting force coefficients (N/mm²)
MATERIAL_COEFFICIENTS = {
    "aluminum_6061":    {"Kc": 700,  "mrr_factor": 1.0, "name": "Aluminum 6061"},
    "aluminum_7075":    {"Kc": 750,  "mrr_factor": 1.05, "name": "Aluminum 7075"},
    "steel_mild":       {"Kc": 1800, "mrr_factor": 1.4,  "name": "Mild Steel"},
    "steel_4140":       {"Kc": 2200, "mrr_factor": 1.6,  "name": "4140 Steel"},
    "stainless_304":    {"Kc": 2500, "mrr_factor": 1.8,  "name": "Stainless 304"},
    "titanium_ti6al4v": {"Kc": 3000, "mrr_factor": 2.2,  "name": "Titanium Ti-6Al-4V"},
    "inconel_718":      {"Kc": 4000, "mrr_factor": 3.0,  "name": "Inconel 718"},
    "plastic_abs":      {"Kc": 250,  "mrr_factor": 0.4,  "name": "ABS Plastic"},
    "plastic_peek":     {"Kc": 400,  "mrr_factor": 0.6,  "name": "PEEK Plastic"},
    "composite_cfrp":   {"Kc": 900,  "mrr_factor": 1.2,  "name": "CFRP Composite"},
    "unknown":          {"Kc": 1500, "mrr_factor": 1.2,  "name": "Unknown Material"},
}

# Fixture surface friction coefficients
SURFACE_FRICTION = {
    "siegmund":     0.15,
    "t_slot":       0.18,
    "rubber_pad":   0.50,
    "bare_steel":   0.12,
    "anodized":     0.20,
    "nitrided":     0.14,
    "unknown":      0.15,
}


class ClampingForceRequest(BaseModel):
    material: str = "aluminum_6061"
    # Cutting parameters
    depth_of_cut_mm: float = 2.0          # axial depth of cut
    width_of_cut_mm: float = 10.0         # radial width of cut
    feed_rate_mm_per_rev: float = 0.1     # feed per revolution
    spindle_speed_rpm: float = 3000.0
    tool_diameter_mm: float = 12.0
    # Fixture geometry
    num_clamps: int = 2
    fixture_surface: str = "siegmund"     # siegmund, t_slot, rubber_pad, bare_steel
    # Safety
    safety_factor: float = 2.5
    # Part geometry
    part_mass_kg: float = 1.0
    part_contact_area_mm2: float = 5000.0  # contact area with fixture


class ClampingForceResponse(BaseModel):
    material: str
    cutting_force_n: float
    friction_force_required_n: float
    clamping_force_per_clamp_n: float
    total_clamping_force_n: float
    safety_factor: float
    recommended_clamp_type: str
    recommendations: list[str]
    breakdown: dict


@router.post("/{project_id}/clamping-force")
async def calculate_clamping_force(
    project_id: str,
    body: ClampingForceRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Calculate required clamping forces using machining force models.

    Based on Merchant's cutting force theory and fixture design principles
    from ASME B5.50 and manufacturing engineering standards.
    """
    sb = get_supabase_client()
    proj = sb.table("projects").select("id,name,environment_json").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    # Validate inputs
    material_key = body.material.lower().replace(" ", "_").replace("-", "_")
    mat = MATERIAL_COEFFICIENTS.get(material_key, MATERIAL_COEFFICIENTS["unknown"])
    mu = SURFACE_FRICTION.get(body.fixture_surface.lower(), 0.15)

    # Cutting speed
    v_c = math.pi * body.tool_diameter_mm * body.spindle_speed_rpm / 1000  # m/min

    # Material removal rate (mm³/min)
    mrr = (body.depth_of_cut_mm * body.width_of_cut_mm *
           body.feed_rate_mm_per_rev * body.spindle_speed_rpm)

    # Tangential (main) cutting force — Kienzle equation
    # F_c = Kc * b * h^(1-mc) where b=width, h=chip thickness
    # Simplified: F_c = Kc * a_p * f * (a_e/D)^0.7
    chip_thickness = body.feed_rate_mm_per_rev * math.sin(math.radians(75))  # approx 75° approach angle
    cutting_force_tangential = (mat["Kc"] * body.depth_of_cut_mm *
                                 chip_thickness * mat["mrr_factor"])

    # Feed force (axial) ≈ 30-40% of tangential
    cutting_force_feed = 0.35 * cutting_force_tangential

    # Radial force ≈ 20-25% of tangential
    cutting_force_radial = 0.22 * cutting_force_tangential

    # Resultant cutting force
    total_cutting_force = math.sqrt(
        cutting_force_tangential**2 + cutting_force_feed**2 + cutting_force_radial**2
    )

    # Weight force
    weight_force = body.part_mass_kg * 9.81  # N

    # Required friction force to resist cutting forces
    # F_friction_needed = total_cutting_force (worst case: all horizontal)
    friction_force_required = total_cutting_force

    # Clamping force needed to generate required friction
    # F_clamp >= F_friction / mu
    # Plus weight component for vertical operations
    clamping_for_friction = friction_force_required / max(mu, 0.01)
    clamping_for_weight = weight_force / max(mu, 0.01)

    # Total clamping force with safety factor
    base_clamping = max(clamping_for_friction, clamping_for_weight)
    total_clamping = base_clamping * body.safety_factor

    # Per-clamp force
    n_clamps = max(body.num_clamps, 1)
    per_clamp_force = total_clamping / n_clamps

    # Contact pressure check
    contact_pressure = total_clamping / max(body.part_contact_area_mm2, 1)
    max_contact_pressure = {
        "aluminum_6061": 50, "aluminum_7075": 60, "steel_mild": 150,
        "steel_4140": 200, "titanium_ti6al4v": 180, "plastic_abs": 10,
    }.get(material_key, 100)

    # Clamp type recommendation
    if per_clamp_force < 200:
        clamp_type = "LC-250-H (Toggle Clamp Horizontal 250N)"
    elif per_clamp_force < 500:
        clamp_type = "LC-500-V (Toggle Clamp Vertical 500N)"
    elif per_clamp_force < 1000:
        clamp_type = "LC-1000-V (Power Clamp 1000N)"
    else:
        clamp_type = "Hydraulic Clamp (custom specification required)"

    # Build recommendations
    recommendations = []

    if per_clamp_force > 2000:
        recommendations.append(
            f"Very high clamping force ({per_clamp_force:.0f} N/clamp). "
            "Consider adding more clamp points or reducing cutting parameters."
        )

    if contact_pressure > max_contact_pressure:
        recommendations.append(
            f"Contact pressure ({contact_pressure:.1f} MPa) exceeds material limit "
            f"({max_contact_pressure} MPa). Add soft jaws or increase contact area."
        )

    if body.safety_factor < 2.0:
        recommendations.append(
            "Safety factor < 2.0 is below ASME B5.50 recommendation of 2.5. "
            "Increase for production use."
        )

    if mu < 0.15:
        recommendations.append(
            "Low friction coefficient detected. Add serrated clamp pads or "
            "apply anti-slip coating to improve grip."
        )

    if body.num_clamps < 2:
        recommendations.append(
            "Minimum 2 clamps recommended per 3-2-1 fixturing principle."
        )

    if not recommendations:
        recommendations.append(
            f"Clamping setup is within normal operating parameters for {mat['name']}."
        )
        recommendations.append(
            f"Verify clamp placement follows 3-2-1 locating rule for deterministic fixturing."
        )

    return {
        "project_id": project_id,
        "material": mat["name"],
        "cutting_force_n": round(total_cutting_force, 2),
        "friction_force_required_n": round(friction_force_required, 2),
        "clamping_force_per_clamp_n": round(per_clamp_force, 2),
        "total_clamping_force_n": round(total_clamping, 2),
        "safety_factor": body.safety_factor,
        "recommended_clamp_type": clamp_type,
        "recommendations": recommendations,
        "breakdown": {
            "tangential_cutting_force_n": round(cutting_force_tangential, 2),
            "feed_force_n": round(cutting_force_feed, 2),
            "radial_force_n": round(cutting_force_radial, 2),
            "weight_force_n": round(weight_force, 2),
            "friction_coefficient": mu,
            "material_removal_rate_mm3_min": round(mrr, 2),
            "cutting_speed_m_min": round(v_c, 2),
            "contact_pressure_mpa": round(contact_pressure, 3),
            "num_clamps": n_clamps,
            "fixture_surface": body.fixture_surface,
        },
    }
