"""
Tolerance stack-up analysis endpoint.
POST /api/projects/{project_id}/tolerance-stack

Supports Worst Case (WC) and Root Sum Square (RSS) methods.
RSS formula: σ_total = sqrt(Σ tᵢ²)
WC formula:  t_total = Σ |tᵢ|

Reference: Dimensioning and Tolerancing Handbook, Drake (1999).
           ASME Y14.5.1M-1994 Mathematical Definition of Dimensioning and Tolerancing.
"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from app.api.deps import get_current_user_id
import math
import logging
from datetime import datetime, timezone

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["tolerance-stack"])


class Dimension(BaseModel):
    name: str
    nominal_mm: float
    tolerance_mm: float = Field(gt=0, description="Half-tolerance (bilateral ±). Always positive.")
    bilateral: bool = True  # True = ±t, False = +t/0 (unilateral)


class ToleranceStackRequest(BaseModel):
    dimensions: list[Dimension] = Field(..., min_length=1, max_length=50)
    method: str = "both"  # "worst_case" | "rss" | "both"


@router.post("/{project_id}/tolerance-stack")
async def run_tolerance_stack(
    project_id: str,
    body: ToleranceStackRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Run tolerance stack-up analysis.

    Worst Case (WC): Ensures 100% of assemblies fit, regardless of process capability.
    t_total = Σ tᵢ  (conservative — used for safety-critical applications per AS9100)

    RSS (Statistical): ~99.73% assemblies fit (±3σ, assuming normal distribution).
    t_rss = √(Σ tᵢ²)  (used when Cpk ≥ 1.33 for all dimensions)
    """
    dims = body.dimensions
    total_nominal = sum(d.nominal_mm for d in dims)

    # Worst Case
    wc_tolerance = sum(d.tolerance_mm for d in dims)
    wc_min = total_nominal - wc_tolerance
    wc_max = total_nominal + wc_tolerance

    # RSS (Root Sum Square)
    rss_tolerance = math.sqrt(sum(d.tolerance_mm ** 2 for d in dims))
    rss_min = total_nominal - rss_tolerance
    rss_max = total_nominal + rss_tolerance

    # Assembly feasibility (gap must be positive if these are a chain closing on a gap)
    assembly_ok_wc  = wc_min >= 0
    assembly_ok_rss = rss_min >= 0

    # Sensitivity — which dimension contributes most to WC stack?
    total_tol = wc_tolerance or 1.0  # avoid div/0
    contributions = [
        {
            "name": d.name,
            "nominal_mm": d.nominal_mm,
            "tolerance_mm": d.tolerance_mm,
            "wc_contribution_pct": round(d.tolerance_mm / total_tol * 100, 1),
            "rss_contribution_pct": round((d.tolerance_mm ** 2 / (rss_tolerance ** 2 or 1)) * 100, 1),
        }
        for d in sorted(dims, key=lambda x: x.tolerance_mm, reverse=True)
    ]

    # Largest contributor
    biggest = contributions[0] if contributions else {}

    summary_parts = [
        f"Stack of {len(dims)} dimensions. Nominal total: {total_nominal:.3f}mm.",
        f"Worst Case: ±{wc_tolerance:.4f}mm ({wc_min:.3f}–{wc_max:.3f}mm).",
        f"RSS (99.73%): ±{rss_tolerance:.4f}mm ({rss_min:.3f}–{rss_max:.3f}mm).",
    ]
    if biggest:
        summary_parts.append(
            f"Largest contributor: '{biggest['name']}' at {biggest['wc_contribution_pct']}% of WC budget."
        )
    if not assembly_ok_wc:
        summary_parts.append("WARNING: Worst case gap is negative — interference possible in worst-case assembly.")
    elif not assembly_ok_rss:
        summary_parts.append("CAUTION: RSS gap is negative — ~0.27% of assemblies may interfere.")
    else:
        summary_parts.append("Assembly fits under both WC and RSS conditions.")

    return {
        "project_id": project_id,
        "method": body.method,
        "dimensions": [
            {"name": d.name, "nominal_mm": d.nominal_mm, "tolerance_mm": d.tolerance_mm}
            for d in dims
        ],
        "total_nominal_mm": round(total_nominal, 4),
        "worst_case_mm": round(wc_tolerance, 4),
        "rss_mm": round(rss_tolerance, 4),
        "gap_min_wc_mm": round(wc_min, 4),
        "gap_max_wc_mm": round(wc_max, 4),
        "gap_min_rss_mm": round(rss_min, 4),
        "gap_max_rss_mm": round(rss_max, 4),
        "assembly_ok": assembly_ok_wc and assembly_ok_rss,
        "assembly_ok_wc": assembly_ok_wc,
        "assembly_ok_rss": assembly_ok_rss,
        "contributions": contributions,
        "summary": " ".join(summary_parts),
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
        "reference": "Drake (1999) Dimensioning and Tolerancing Handbook; ASME Y14.5.1M-1994",
    }
