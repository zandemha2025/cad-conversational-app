"""
GD&T callout endpoints — generate and retrieve geometric dimensioning
and tolerancing callouts for a project.
"""
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from app.services.gemini_service import GeminiService

router = APIRouter(prefix="/projects", tags=["gdt"])
log = logging.getLogger(__name__)
gemini = GeminiService()


class GdtCallout(BaseModel):
    symbol: str
    tolerance: str
    datum_refs: list[str]
    feature: str
    rationale: str


class GdtResponse(BaseModel):
    project_id: str
    callouts: list[GdtCallout]
    generated_at: str | None = None


@router.get("/{project_id}/gdt", response_model=GdtResponse)
async def get_gdt_callouts(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Return stored GD&T callouts for a project (from validation_results)."""
    sb = get_supabase_client()
    res = (
        sb.table("validation_results")
        .select("issues_json, ran_at")
        .eq("project_id", project_id)
        .eq("method", "gdt")
        .order("ran_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return GdtResponse(project_id=project_id, callouts=[])

    raw_callouts = rows[0].get("issues_json") or []
    callouts = []
    for c in raw_callouts:
        try:
            callouts.append(GdtCallout(**c))
        except Exception:
            log.warning("Skipping malformed GD&T callout: %s", c)
    return GdtResponse(
        project_id=project_id,
        callouts=callouts,
        generated_at=rows[0].get("ran_at"),
    )


@router.post("/{project_id}/gdt/generate", response_model=GdtResponse)
async def generate_gdt_callouts(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Generate GD&T callouts via Gemini Flash and store them."""
    sb = get_supabase_client()

    # Load part geometry
    geom_res = (
        sb.table("part_geometries")
        .select("features_json")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    features = (
        geom_res.data[0].get("features_json") or {}
        if geom_res.data
        else {}
    )

    # Load project for context
    proj_res = sb.table("projects").select("name, description").eq("id", project_id).single().execute()
    proj = proj_res.data or {}
    user_prompt = proj.get("description") or proj.get("name") or "machined part"

    # Generate via Gemini
    callouts = await gemini.generate_gdt_callouts(features, user_prompt)

    # Store as a validation_results row with method='gdt'
    now = datetime.now(timezone.utc).isoformat()
    sb.table("validation_results").insert({
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "method": "gdt",
        "issues_json": callouts,
        "error_count": 0,
        "warning_count": len(callouts),
        "ran_at": now,
    }).execute()

    parsed = []
    for c in callouts:
        try:
            parsed.append(GdtCallout(**c))
        except Exception:
            log.warning("Skipping malformed GD&T callout: %s", c)

    return GdtResponse(
        project_id=project_id,
        callouts=parsed,
        generated_at=now,
    )
