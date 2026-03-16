"""
FEA Lite route — Euler beam deflection + 3-2-1 equilibrium.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from app.api.deps import get_current_user_id
from app.services.fea_lite import calculate_plate_deflection, calculate_321_equilibrium

router = APIRouter(prefix="/projects", tags=["fea-lite"])


class FeaLiteRequest(BaseModel):
    length_mm: float = 165.0
    width_mm: float = 115.0
    thickness_mm: float = 15.0
    material: str = "cast_tooling_plate"
    clamping_force_n: float = 500.0
    support_count: int = 3


@router.post("/{project_id}/fea-lite")
async def run_fea_lite(
    project_id: str,
    body: FeaLiteRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Run simplified Euler beam deflection analysis for base plate."""
    result = calculate_plate_deflection(
        length_mm=body.length_mm,
        width_mm=body.width_mm,
        thickness_mm=body.thickness_mm,
        material=body.material,
        clamping_force_n=body.clamping_force_n,
        support_count=body.support_count,
    )
    return result


class Equilibrium321Request(BaseModel):
    clamping_forces_n: list[float] = [500.0]
    part_weight_n: float = 5.0


@router.post("/{project_id}/fea-lite/equilibrium")
async def run_equilibrium(
    project_id: str,
    body: Equilibrium321Request,
    user_id: str = Depends(get_current_user_id),
):
    """Run 3-2-1 static moment equilibrium for touchpoint force distribution."""
    from app.core.database import get_supabase_client
    sb = get_supabase_client()

    rows = (
        sb.table("touchpoints")
        .select("type,coords_json")
        .eq("project_id", project_id)
        .execute()
    )
    touchpoints = rows.data if rows.data else []
    result = calculate_321_equilibrium(
        touchpoints=touchpoints,
        clamping_forces_n=body.clamping_forces_n,
        part_weight_n=body.part_weight_n,
    )
    return result
