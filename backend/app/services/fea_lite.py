"""
FEA Lite — Kirchhoff plate deflection + Euler beam deflection + 3-2-1 equilibrium.

Plate theory reference: Timoshenko & Woinowsky-Krieger, "Theory of Plates and Shells"
  delta_max = (alpha * q * a^4) / D
  D = E * t^3 / (12 * (1 - nu^2))   plate flexural rigidity (N*mm)
  alpha = 0.00126  clamped-edge square plate (bolted fixture plate — Timoshenko Table 35)
  alpha = 0.01380  simply-supported square plate (for reference only)
  q = total_load / (length * width)  distributed load intensity (N/mm²)
  a = max(length, width)             longer plate dimension (mm)

Euler beam formula retained for cross-check:
  delta_beam = P * L^3 / (48 * E * I)  (simply-supported, point load at midspan)
"""
import math
from typing import Any


# Timoshenko alpha coefficient for maximum deflection of a square plate
# under uniformly distributed load (Table 35, Theory of Plates and Shells)
ALPHA_CLAMPED = 0.00126       # all edges clamped (bolted fixture plate)
ALPHA_SIMPLY_SUPPORTED = 0.0138  # all edges simply supported (reference)


# Material look-up: (E in GPa, yield strength in MPa, Poisson's ratio)
_PLATE_MATERIALS: dict[str, dict[str, float]] = {
    "al_6061_t6": {
        "youngs_modulus_gpa": 68.9,
        "yield_strength_mpa": 276.0,
        "poissons_ratio": 0.33,
    },
    "steel_1018": {
        "youngs_modulus_gpa": 200.0,
        "yield_strength_mpa": 370.0,
        "poissons_ratio": 0.29,
    },
    "cast_tooling_plate": {
        "youngs_modulus_gpa": 73.0,
        "yield_strength_mpa": 250.0,
        "poissons_ratio": 0.33,
    },
    "pa12_cf": {
        "youngs_modulus_gpa": 6.0,
        "yield_strength_mpa": 80.0,
        "poissons_ratio": 0.38,
    },
    "onyx": {
        "youngs_modulus_gpa": 2.4,
        "yield_strength_mpa": 40.0,
        "poissons_ratio": 0.38,
    },
}

_DEFAULT_MATERIAL: dict[str, float] = {
    "youngs_modulus_gpa": 70.0,
    "yield_strength_mpa": 250.0,
    "poissons_ratio": 0.33,
}


def _lookup_material(material: str) -> dict[str, float]:
    key = material.lower().replace(" ", "_").replace("-", "_")
    return _PLATE_MATERIALS.get(key, _DEFAULT_MATERIAL)


def calculate_plate_deflection(
    length_mm: float,
    width_mm: float,
    thickness_mm: float,
    material: str,
    clamping_force_n: float,
    support_count: int = 3,
) -> dict[str, Any]:
    """
    Compute fixture base-plate deflection using Kirchhoff plate theory (primary)
    and Euler beam theory (secondary, for reference).

    The Kirchhoff model treats the plate as a thin elastic plate with clamped
    edges (all four sides bolted), which is appropriate for fixture base plates.
    This is more accurate than beam theory when width/length > ~0.4.

    Returns deflection in mm, bending stress in MPa, and safety factor against yield.
    """
    mat = _lookup_material(material)
    E_gpa = mat["youngs_modulus_gpa"]
    Sy = mat["yield_strength_mpa"]
    nu = mat["poissons_ratio"]

    E = E_gpa * 1000.0  # N/mm² = MPa
    t = thickness_mm
    a = max(length_mm, width_mm)   # longer plate dimension
    b_dim = min(length_mm, width_mm)

    # ── Kirchhoff plate deflection (clamped boundary) ──────────────────────────
    # Plate flexural rigidity
    D = (E * t**3) / (12.0 * (1.0 - nu**2))

    # Distributed load intensity (uniform)
    plate_area = length_mm * width_mm
    q = clamping_force_n / max(plate_area, 1.0)  # N/mm²

    # Maximum deflection: delta = alpha * q * a^4 / D
    if D < 1e-6:
        plate_deflection_mm = 0.0
    else:
        plate_deflection_mm = (ALPHA_CLAMPED * q * a**4) / D

    # Peak bending stress at clamped edge (Timoshenko): sigma = beta * q * a^2 / t^2
    # beta ~ 0.0513 for clamped square plate (Timoshenko Table 35)
    BETA_CLAMPED = 0.0513
    plate_sigma_mpa = (BETA_CLAMPED * q * a**2) / (t**2) if t > 1e-6 else 0.0

    # ── Euler beam deflection (simply-supported, point load at centre) ─────────
    # Kept for reference: models the plate as a 1-D beam along its long axis.
    L = length_mm
    b_beam = width_mm
    I_beam = (b_beam * t**3) / 12.0
    P_beam = clamping_force_n / max(support_count, 1)
    if I_beam < 1e-6:
        beam_deflection_mm = 0.0
        beam_sigma_mpa = 0.0
    else:
        beam_deflection_mm = (P_beam * L**3) / (48.0 * E * I_beam)
        M_beam = P_beam * L / 4.0
        beam_sigma_mpa = (M_beam * (t / 2.0)) / I_beam

    # ── Safety factor against yield (Kirchhoff stress governs) ────────────────
    governing_sigma = max(plate_sigma_mpa, 1e-9)
    safety_factor = min(Sy / governing_sigma, 99.0)

    tolerance_mm = 0.1  # typical fixture plate flatness tolerance
    within_tolerance = plate_deflection_mm <= tolerance_mm

    return {
        # Primary result — Kirchhoff plate theory
        "deflection_mm": round(plate_deflection_mm, 4),
        "max_stress_mpa": round(plate_sigma_mpa, 2),
        "yield_strength_mpa": Sy,
        "safety_factor": round(safety_factor, 2),
        "within_tolerance": within_tolerance,
        "tolerance_mm": tolerance_mm,
        # Secondary result — Euler beam (for reference / cross-check)
        "beam_deflection_mm": round(beam_deflection_mm, 4),
        "beam_stress_mpa": round(beam_sigma_mpa, 2),
        # Plate parameters used
        "plate_rigidity_d_n_mm": round(D, 2),
        "distributed_load_q_n_mm2": round(q, 6),
        "inputs": {
            "length_mm": length_mm,
            "width_mm": width_mm,
            "thickness_mm": thickness_mm,
            "material": material,
            "clamping_force_n": clamping_force_n,
            "support_count": support_count,
            "E_gpa": E_gpa,
            "poissons_ratio": nu,
            "boundary_condition": "clamped (alpha=0.00126)",
        },
        "interpretation": (
            f"Kirchhoff plate: {plate_deflection_mm:.4f}mm deflection under "
            f"{clamping_force_n:.0f}N distributed load. "
            f"{'Within' if within_tolerance else 'EXCEEDS'} ±{tolerance_mm}mm tolerance. "
            f"Safety factor: {safety_factor:.1f}x against yield ({Sy:.0f}MPa). "
            f"Euler beam (reference): {beam_deflection_mm:.4f}mm. "
            f"Clamped-edge plate model is more accurate for bolted fixture plates."
        ),
    }


def calculate_321_equilibrium(
    touchpoints: list[dict[str, Any]],
    clamping_forces_n: list[float],
    part_weight_n: float = 5.0,
) -> dict[str, Any]:
    """
    Static moment equilibrium for a 3-2-1 locating scheme.
    Calculates reaction forces at each support point.
    """
    locating = [tp for tp in touchpoints if tp.get("type") == "locating"]
    clamping = [tp for tp in touchpoints if tp.get("type") == "clamping"]
    support  = [tp for tp in touchpoints if tp.get("type") == "support"]

    total_clamp_force = sum(clamping_forces_n)
    total_reaction = total_clamp_force + part_weight_n

    # Distribute reaction evenly across support pads (simplified; assumes symmetric layout)
    support_reaction_per_pad = total_reaction / max(len(support), 1)

    # Count constrained DOF: each locating pin constrains 2 translational DOF,
    # each support pad constrains 1 (normal direction)
    dof_constrained = min(len(locating) * 2 + len(support) * 1, 6)

    return {
        "total_clamping_force_n": round(total_clamp_force, 1),
        "total_reaction_n": round(total_reaction, 1),
        "support_reaction_per_pad_n": round(support_reaction_per_pad, 1),
        "dof_constrained": dof_constrained,
        "is_fully_constrained": dof_constrained >= 6,
        "clamping_count": len(clamping),
        "locating_count": len(locating),
        "support_count": len(support),
    }
