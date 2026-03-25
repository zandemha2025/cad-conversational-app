"""
Materials library endpoint — public, no auth required.
GET /api/materials          → list all materials
GET /api/materials/{id}     → single material

Provides the full MATERIAL_PROPERTIES dict so CAM software, front-ends,
and external integrations can query material data without re-implementing it.

Data sources: Sandvik Coromant Machining Calculator, Kennametal NOVO,
ASM Handbook Vol. 16 (Machining), ASME B5.50.
"""
from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/materials", tags=["materials"])

MATERIAL_PROPERTIES: dict[str, dict] = {
    "aluminum_6061": {
        "id": "aluminum_6061",
        "display_name": "Aluminum 6061-T6",
        "category": "aluminum",
        "density_kg_m3": 2700,
        "yield_strength_mpa": 276,
        "ultimate_strength_mpa": 310,
        "hardness_hb": 95,
        "youngs_modulus_gpa": 68.9,
        "poissons_ratio": 0.33,
        "thermal_conductivity_w_mk": 167,
        "machinability_rating": 90,
        "kc1_1": 700,
        "mc": 0.27,
        "notes": "Most commonly machined aluminium alloy. Excellent machinability. T6 temper (solution + artificial age).",
    },
    "aluminum_7075": {
        "id": "aluminum_7075",
        "display_name": "Aluminum 7075-T6",
        "category": "aluminum",
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
        "notes": "High-strength aerospace aluminium. Good machinability. Used in aerospace structural components (Boeing/Airbus).",
    },
    "mild_steel_1018": {
        "id": "mild_steel_1018",
        "display_name": "Mild Steel 1018",
        "category": "carbon_steel",
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
        "notes": "Low-carbon free-machining steel. Good weldability. Common in fixture components and general engineering.",
    },
    "steel_4140": {
        "id": "steel_4140",
        "display_name": "Steel 4140 (annealed)",
        "category": "alloy_steel",
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
        "notes": "Chromium-molybdenum alloy steel. High strength-to-weight. Used in tooling, shafts, dies. Values shown for annealed condition.",
    },
    "stainless_304": {
        "id": "stainless_304",
        "display_name": "Stainless Steel 304",
        "category": "stainless_steel",
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
        "notes": "Austenitic stainless. Work-hardens significantly during machining. Low thermal conductivity requires flood coolant.",
    },
    "titanium_ti6al4v": {
        "id": "titanium_ti6al4v",
        "display_name": "Titanium Ti-6Al-4V",
        "category": "titanium",
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
        "notes": "Grade 5 titanium. Aerospace workhorse (Boeing 787: ~15% Ti by weight). Low thermal conductivity — heat concentrates at tool tip. Requires flood coolant. Fire hazard from dry chips.",
    },
    "inconel_718": {
        "id": "inconel_718",
        "display_name": "Inconel 718",
        "category": "nickel_superalloy",
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
        "notes": "Nickel-base superalloy. Jet engine turbine discs, casings. Extremely low machinability — short tool life, high cutting forces. Requires ceramic or CBN tooling for high-speed operations.",
    },
    "abs_plastic": {
        "id": "abs_plastic",
        "display_name": "ABS Plastic",
        "category": "thermoplastic",
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
        "notes": "Common engineering thermoplastic. Low melting point — avoid coolant, use compressed air. Sharp, high-rake tooling recommended.",
    },
    "peek_plastic": {
        "id": "peek_plastic",
        "display_name": "PEEK",
        "category": "thermoplastic",
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
        "notes": "High-performance semi-crystalline polymer. Used in aerospace and medical implants. Machines cleanly but requires sharp tooling and chip clearance.",
    },
    "cfrp_composite": {
        "id": "cfrp_composite",
        "display_name": "CFRP Composite",
        "category": "composite",
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
        "notes": "Carbon fibre reinforced polymer. Anisotropic material — strength varies with fibre direction. Abrasive to tooling. Dust is a health hazard — LEV and FFP3 respirator mandatory.",
    },
}


@router.get("")
async def list_materials():
    """
    Return all materials as a list. Public endpoint — no auth required.
    Used by CAM software, front-end selectors, and external integrations.
    """
    return list(MATERIAL_PROPERTIES.values())


@router.get("/{material_id}")
async def get_material(material_id: str):
    """
    Return a single material by its ID (e.g. 'aluminum_6061'). Public endpoint.
    """
    key = material_id.lower().replace("-", "_").replace(" ", "_")
    mat = MATERIAL_PROPERTIES.get(key)
    if mat is None:
        raise HTTPException(
            status_code=404,
            detail=f"Material '{material_id}' not found. "
                   f"Available: {', '.join(MATERIAL_PROPERTIES.keys())}",
        )
    return mat
