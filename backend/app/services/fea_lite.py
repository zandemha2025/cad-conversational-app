"""
FEA Lite — Euler beam deflection + clamping force equilibrium.
Used for fixture base plate deflection under clamping loads.
"""
import math
from typing import Any


def calculate_plate_deflection(
    length_mm: float,
    width_mm: float,
    thickness_mm: float,
    material: str,
    clamping_force_n: float,
    support_count: int = 3,
) -> dict[str, Any]:
    """
    Simplified Euler beam deflection for base plate under clamping load.
    Models the plate as a simply-supported beam loaded at center.

    Returns deflection in mm, stress in MPa, safety factor.
    """
    # Material properties
    E_GPA = {
        "al_6061_t6": 68.9,
        "steel_1018": 200.0,
        "cast_tooling_plate": 73.0,
        "pa12_cf": 6.0,
        "onyx": 2.4,
    }.get(material.lower().replace(" ", "_").replace("-", "_"), 70.0)

    E = E_GPA * 1000  # MPa = N/mm²
    Sy = {
        "al_6061_t6": 276.0,
        "steel_1018": 370.0,
        "cast_tooling_plate": 250.0,
        "pa12_cf": 80.0,
        "onyx": 40.0,
    }.get(material.lower().replace(" ", "_").replace("-", "_"), 250.0)

    # Beam properties
    L = length_mm  # span (mm)
    b = width_mm   # width (mm)
    h = thickness_mm  # height / thickness (mm)

    # Second moment of area for rectangular cross-section: I = bh³/12
    I = (b * h ** 3) / 12  # mm⁴

    # Distribute load across supports: worst-case = full load at center
    P = clamping_force_n / max(support_count, 1)

    # Max deflection for simply-supported beam, point load at center: δ = PL³/48EI
    if I < 1e-6:
        deflection_mm = 0.0
    else:
        deflection_mm = (P * L ** 3) / (48 * E * I)

    # Max bending stress: σ = M·c/I where M = PL/4, c = h/2
    M = P * L / 4  # N·mm
    c = h / 2
    sigma_max_mpa = (M * c) / I if I > 1e-6 else 0.0

    # Safety factor
    safety_factor = Sy / sigma_max_mpa if sigma_max_mpa > 1e-6 else 99.0

    # Interpretation
    tolerance_mm = 0.1  # typical fixture tolerance
    within_tolerance = deflection_mm <= tolerance_mm

    return {
        "deflection_mm": round(deflection_mm, 4),
        "max_stress_mpa": round(sigma_max_mpa, 2),
        "yield_strength_mpa": Sy,
        "safety_factor": round(min(safety_factor, 99.0), 2),
        "within_tolerance": within_tolerance,
        "tolerance_mm": tolerance_mm,
        "inputs": {
            "length_mm": length_mm,
            "width_mm": width_mm,
            "thickness_mm": thickness_mm,
            "material": material,
            "clamping_force_n": clamping_force_n,
            "support_count": support_count,
            "E_gpa": E_GPA,
        },
        "interpretation": (
            f"Base plate deflects {deflection_mm:.3f}mm under {clamping_force_n:.0f}N clamping load. "
            f"{'Within' if within_tolerance else 'EXCEEDS'} ±{tolerance_mm}mm tolerance. "
            f"Safety factor: {safety_factor:.1f}x. "
            f"Max bending stress: {sigma_max_mpa:.1f}MPa (Sy={Sy:.0f}MPa)."
        ),
    }


def calculate_321_equilibrium(
    touchpoints: list[dict[str, Any]],
    clamping_forces_n: list[float],
    part_weight_n: float = 5.0,
) -> dict[str, Any]:
    """
    Static moment equilibrium for 3-2-1 locating scheme.
    Calculates reaction forces at each support point.
    """
    locating = [tp for tp in touchpoints if tp.get("type") == "locating"]
    clamping = [tp for tp in touchpoints if tp.get("type") == "clamping"]
    support = [tp for tp in touchpoints if tp.get("type") == "support"]

    total_clamp_force = sum(clamping_forces_n)
    total_reaction = total_clamp_force + part_weight_n

    # Distribute reaction evenly across support pads (simplified)
    support_reaction_per_pad = total_reaction / max(len(support), 1)

    # Check over-constraint
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
