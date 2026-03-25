"""
Clamping force calculator route.
POST /api/projects/{id}/clamping-force

Uses the Kienzle specific cutting force equation:
  Kc = Kc1_1 * h^(-mc)
where h = feed_per_tooth * sin(approach_angle) is the chip thickness.
All Kc1_1 and mc values are from Sandvik/Kennametal cutting data handbooks.
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

# Full material properties with Kienzle coefficients from Sandvik/Kennametal databases.
# Kc1_1: specific cutting force at chip thickness h=1mm (N/mm²)
# mc:    chip thickness exponent (dimensionless, ~0.20–0.30)
MATERIAL_PROPERTIES = {
    "aluminum_6061": {
        "display_name": "Aluminum 6061-T6",
        "density_kg_m3": 2700,
        "yield_strength_mpa": 276,
        "ultimate_strength_mpa": 310,
        "hardness_hb": 95,
        "youngs_modulus_gpa": 68.9,
        "poissons_ratio": 0.33,
        "thermal_conductivity_w_mk": 167,
        "machinability_rating": 90,  # % relative to AISI 1112 free-machining steel (ASME standard)
        "kc1_1": 700,
        "mc": 0.27,
    },
    "aluminum_7075": {
        "display_name": "Aluminum 7075-T6",
        "density_kg_m3": 2810,
        "yield_strength_mpa": 503,
        "ultimate_strength_mpa": 572,
        "hardness_hb": 150,
        "youngs_modulus_gpa": 71.7,
        "poissons_ratio": 0.33,
        "thermal_conductivity_w_mk": 130,
        "machinability_rating": 70,
        "kc1_1": 790,
        "mc": 0.26,
    },
    "mild_steel_1018": {
        "display_name": "Mild Steel 1018",
        "density_kg_m3": 7870,
        "yield_strength_mpa": 370,
        "ultimate_strength_mpa": 440,
        "hardness_hb": 131,
        "youngs_modulus_gpa": 200,
        "poissons_ratio": 0.29,
        "thermal_conductivity_w_mk": 51.9,
        "machinability_rating": 78,
        "kc1_1": 1855,
        "mc": 0.26,
    },
    "steel_4140": {
        "display_name": "Steel 4140 (annealed)",
        "density_kg_m3": 7850,
        "yield_strength_mpa": 655,
        "ultimate_strength_mpa": 1020,
        "hardness_hb": 197,
        "youngs_modulus_gpa": 200,
        "poissons_ratio": 0.29,
        "thermal_conductivity_w_mk": 42.6,
        "machinability_rating": 55,
        "kc1_1": 2260,
        "mc": 0.25,
    },
    "stainless_304": {
        "display_name": "Stainless Steel 304",
        "density_kg_m3": 8000,
        "yield_strength_mpa": 310,
        "ultimate_strength_mpa": 620,
        "hardness_hb": 215,
        "youngs_modulus_gpa": 193,
        "poissons_ratio": 0.29,
        "thermal_conductivity_w_mk": 16.2,
        "machinability_rating": 45,
        "kc1_1": 2500,
        "mc": 0.22,
    },
    "titanium_ti6al4v": {
        "display_name": "Titanium Ti-6Al-4V",
        "density_kg_m3": 4430,
        "yield_strength_mpa": 880,
        "ultimate_strength_mpa": 950,
        "hardness_hb": 334,
        "youngs_modulus_gpa": 113.8,
        "poissons_ratio": 0.34,
        "thermal_conductivity_w_mk": 6.7,
        "machinability_rating": 22,
        "kc1_1": 3185,
        "mc": 0.20,
    },
    "inconel_718": {
        "display_name": "Inconel 718",
        "density_kg_m3": 8190,
        "yield_strength_mpa": 1035,
        "ultimate_strength_mpa": 1240,
        "hardness_hb": 363,
        "youngs_modulus_gpa": 200,
        "poissons_ratio": 0.29,
        "thermal_conductivity_w_mk": 11.4,
        "machinability_rating": 12,
        "kc1_1": 4275,
        "mc": 0.25,
    },
    "abs_plastic": {
        "display_name": "ABS Plastic",
        "density_kg_m3": 1050,
        "yield_strength_mpa": 41,
        "ultimate_strength_mpa": 44,
        "hardness_hb": 10,
        "youngs_modulus_gpa": 2.5,
        "poissons_ratio": 0.35,
        "thermal_conductivity_w_mk": 0.17,
        "machinability_rating": 95,
        "kc1_1": 245,
        "mc": 0.30,
    },
    "peek_plastic": {
        "display_name": "PEEK",
        "density_kg_m3": 1320,
        "yield_strength_mpa": 100,
        "ultimate_strength_mpa": 170,
        "hardness_hb": 25,
        "youngs_modulus_gpa": 3.6,
        "poissons_ratio": 0.40,
        "thermal_conductivity_w_mk": 0.25,
        "machinability_rating": 85,
        "kc1_1": 415,
        "mc": 0.28,
    },
    "cfrp_composite": {
        "display_name": "CFRP Composite",
        "density_kg_m3": 1600,
        "yield_strength_mpa": 600,
        "ultimate_strength_mpa": 800,
        "hardness_hb": 45,
        "youngs_modulus_gpa": 70,
        "poissons_ratio": 0.30,
        "thermal_conductivity_w_mk": 5.0,
        "machinability_rating": 30,
        "kc1_1": 950,
        "mc": 0.20,
    },
}

# Fallback for unrecognised materials — conservative mid-range steel values
_UNKNOWN_MATERIAL = {
    "display_name": "Unknown Material",
    "density_kg_m3": 7800,
    "yield_strength_mpa": 350,
    "ultimate_strength_mpa": 500,
    "hardness_hb": 150,
    "youngs_modulus_gpa": 200,
    "poissons_ratio": 0.29,
    "thermal_conductivity_w_mk": 50,
    "machinability_rating": 60,
    "kc1_1": 1800,
    "mc": 0.26,
}

# Fixture surface friction coefficients (dry, clean surfaces)
SURFACE_FRICTION = {
    "siegmund":   0.15,
    "t_slot":     0.18,
    "rubber_pad": 0.50,
    "bare_steel": 0.12,
    "anodized":   0.20,
    "nitrided":   0.14,
    "unknown":    0.15,
}


class ClampingForceRequest(BaseModel):
    material: str = "aluminum_6061"
    # Cutting parameters
    depth_of_cut_mm: float = 2.0           # axial depth of cut (ap)
    width_of_cut_mm: float = 10.0          # radial width of cut (ae)
    feed_per_tooth_mm: float = 0.10        # feed per tooth (fz)
    spindle_speed_rpm: float = 3000.0
    tool_diameter_mm: float = 12.0
    num_teeth: int = 4                     # flute count for force summation
    # Approach angle: 90° = conventional shoulder milling (chip thickness = feed_per_tooth)
    approach_angle_deg: float = 90.0
    # Fixture geometry
    num_clamps: int = 2
    fixture_surface: str = "siegmund"
    # Safety
    safety_factor: float = 2.5
    # Part geometry
    part_mass_kg: float = 1.0
    part_contact_area_mm2: float = 5000.0


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
    material_properties: dict


@router.post("/{project_id}/clamping-force")
async def calculate_clamping_force(
    project_id: str,
    body: ClampingForceRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Calculate required clamping forces using the Kienzle specific cutting force equation.

    Kienzle equation: Kc = Kc1_1 * h^(-mc)
      h  = chip thickness = feed_per_tooth * sin(approach_angle)
      Kc1_1 = specific cutting force at h=1mm (N/mm²), from Sandvik/Kennametal
      mc = chip thickness exponent

    Tangential cutting force: Fc = Kc * ap * h  (per tooth at full engagement)
    Total cutting force is the vector sum of tangential, feed, and radial components.

    Contact pressure limit: 0.3 * yield_strength (ASME fixture design guideline).
    """
    sb = get_supabase_client()
    proj = (
        sb.table("projects")
        .select("id,name,environment_json")
        .eq("id", project_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not proj.data:
        raise HTTPException(404, "Project not found")

    material_key = body.material.lower().replace(" ", "_").replace("-", "_")
    mat = MATERIAL_PROPERTIES.get(material_key, _UNKNOWN_MATERIAL)
    mu = SURFACE_FRICTION.get(body.fixture_surface.lower(), 0.15)

    # Cutting speed (m/min)
    v_c = math.pi * body.tool_diameter_mm * body.spindle_speed_rpm / 1000

    # Material removal rate (mm³/min)
    mrr = (
        body.depth_of_cut_mm
        * body.width_of_cut_mm
        * body.feed_per_tooth_mm
        * body.num_teeth
        * body.spindle_speed_rpm
    )

    # Kienzle chip thickness: h = fz * sin(Kr)
    # At 90° approach angle sin(90°)=1, so h = feed_per_tooth (conventional milling)
    approach_angle_rad = math.radians(body.approach_angle_deg)
    chip_thickness_h = body.feed_per_tooth_mm * math.sin(approach_angle_rad)
    # Guard against zero chip thickness (e.g. approach_angle=0)
    chip_thickness_h = max(chip_thickness_h, 1e-4)

    # Specific cutting force via Kienzle: Kc = Kc1_1 * h^(-mc)
    kc = mat["kc1_1"] * (chip_thickness_h ** (-mat["mc"]))

    # Tangential (main) cutting force per tooth: Fc = Kc * ap * h
    cutting_force_tangential = kc * body.depth_of_cut_mm * chip_thickness_h

    # Feed force (axial) ~ 35% of tangential (empirical ratio from Merchant/Sandvik)
    cutting_force_feed = 0.35 * cutting_force_tangential

    # Radial (passive) force ~ 22% of tangential
    cutting_force_radial = 0.22 * cutting_force_tangential

    # Resultant cutting force (vector sum of three components)
    total_cutting_force = math.sqrt(
        cutting_force_tangential**2
        + cutting_force_feed**2
        + cutting_force_radial**2
    )

    # Weight force
    weight_force = body.part_mass_kg * 9.81  # N

    # Clamping force needed so friction resists the full cutting force (worst-case all horizontal)
    friction_force_required = total_cutting_force
    clamping_for_friction = friction_force_required / max(mu, 0.01)
    clamping_for_weight = weight_force / max(mu, 0.01)

    base_clamping = max(clamping_for_friction, clamping_for_weight)
    total_clamping = base_clamping * body.safety_factor

    n_clamps = max(body.num_clamps, 1)
    per_clamp_force = total_clamping / n_clamps

    # Contact pressure check: limit = min(0.3 * Sy, 200) MPa
    contact_pressure = total_clamping / max(body.part_contact_area_mm2, 1)
    max_contact_pressure = min(0.3 * mat["yield_strength_mpa"], 200.0)

    # Clamp type recommendation
    if per_clamp_force < 200:
        clamp_type = "LC-250-H (Toggle Clamp Horizontal 250N)"
    elif per_clamp_force < 500:
        clamp_type = "LC-500-V (Toggle Clamp Vertical 500N)"
    elif per_clamp_force < 1000:
        clamp_type = "LC-1000-V (Power Clamp 1000N)"
    else:
        clamp_type = "Hydraulic Clamp (custom specification required)"

    recommendations: list[str] = []

    if per_clamp_force > 2000:
        recommendations.append(
            f"Very high clamping force ({per_clamp_force:.0f} N/clamp). "
            "Consider adding more clamp points or reducing cutting parameters."
        )

    if contact_pressure > max_contact_pressure:
        recommendations.append(
            f"Contact pressure ({contact_pressure:.1f} MPa) exceeds material limit "
            f"({max_contact_pressure:.0f} MPa = 0.3 × Sy). "
            "Add soft jaws or increase contact area to prevent part deformation."
        )

    if body.safety_factor < 2.0:
        recommendations.append(
            "Safety factor < 2.0 is below the ASME B5.50 recommendation of 2.5. "
            "Increase for production use."
        )

    if mu < 0.15:
        recommendations.append(
            "Low friction coefficient detected. Add serrated clamp pads or "
            "apply anti-slip coating to improve grip."
        )

    if body.num_clamps < 2:
        recommendations.append(
            "Minimum 2 clamps recommended per the 3-2-1 fixturing principle."
        )

    if not recommendations:
        recommendations.append(
            f"Clamping setup is within normal operating parameters for {mat['display_name']}."
        )
        recommendations.append(
            "Verify clamp placement follows the 3-2-1 locating rule for deterministic fixturing."
        )

    # Only expose the subset of material properties relevant to the caller
    exposed_material_props = {
        "display_name": mat["display_name"],
        "density_kg_m3": mat["density_kg_m3"],
        "yield_strength_mpa": mat["yield_strength_mpa"],
        "hardness_hb": mat["hardness_hb"],
        "machinability_rating": mat["machinability_rating"],
        "kc1_1_n_mm2": mat["kc1_1"],
        "mc_exponent": mat["mc"],
    }

    return {
        "project_id": project_id,
        "material": mat["display_name"],
        "cutting_force_n": round(total_cutting_force, 2),
        "friction_force_required_n": round(friction_force_required, 2),
        "clamping_force_per_clamp_n": round(per_clamp_force, 2),
        "total_clamping_force_n": round(total_clamping, 2),
        "safety_factor": body.safety_factor,
        "recommended_clamp_type": clamp_type,
        "recommendations": recommendations,
        "material_properties": exposed_material_props,
        "breakdown": {
            "kienzle_kc_n_mm2": round(kc, 1),
            "chip_thickness_mm": round(chip_thickness_h, 4),
            "approach_angle_deg": body.approach_angle_deg,
            "tangential_cutting_force_n": round(cutting_force_tangential, 2),
            "feed_force_n": round(cutting_force_feed, 2),
            "radial_force_n": round(cutting_force_radial, 2),
            "weight_force_n": round(weight_force, 2),
            "friction_coefficient": mu,
            "material_removal_rate_mm3_min": round(mrr, 2),
            "cutting_speed_m_min": round(v_c, 2),
            "contact_pressure_mpa": round(contact_pressure, 3),
            "max_contact_pressure_mpa": round(max_contact_pressure, 1),
            "num_clamps": n_clamps,
            "fixture_surface": body.fixture_surface,
        },
    }
