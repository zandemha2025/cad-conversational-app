"""
Study Mode — design variation studies.

POST /api/projects/{id}/studies        — create study + queue N variations
GET  /api/projects/{id}/studies        — list studies for project
GET  /api/projects/{id}/studies/{sid}  — get study with all variation results
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["studies"])

# Variation strategies applied on top of the user's base prompt
VARIATION_STRATEGIES = [
    ("Optimize for Strength",         "optimize for maximum structural strength and rigidity"),
    ("Optimize for Weight",           "minimize weight while maintaining structural integrity"),
    ("Optimize for Manufacturability","simplify geometry for ease of machining and reduced cycle time"),
    ("Minimize Material",             "reduce material usage and production cost"),
    ("Maximize Grip Area",            "maximize clamping and locating surface area for better part retention"),
    ("Minimize Cost",                 "use simpler geometry and standard hardware to minimize total cost"),
    ("Maximize Precision",            "maximize locating repeatability and datum feature precision"),
    ("Thermal Stability",             "optimize for thermal stability in high-temperature environments"),
    ("Modular Design",                "design with interchangeable modular components"),
    ("Ergonomic Loading",             "optimize for ease of operator part loading and unloading"),
]


class CreateStudyRequest(BaseModel):
    base_prompt: str = Field(..., description="Base design prompt for all variations")
    num_variations: int = Field(5, ge=1, le=10, description="Number of variations to generate (1–10)")


@router.post("/{project_id}/studies")
async def create_study(
    project_id: str,
    body: CreateStudyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Create a design study: generates N fixture variations for the given prompt,
    each with a different optimization objective.
    """
    sb = get_supabase_client()

    # Verify project ownership
    proj = sb.table("projects").select("id,name").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    # Fetch latest fixture KCL to use as base for iterative variations
    fixture_res = (
        sb.table("fixture_geometries")
        .select("kcl,version")
        .eq("project_id", project_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    prev_kcl = None
    prev_ver = 0
    if fixture_res.data and fixture_res.data[0].get("kcl"):
        prev_kcl = fixture_res.data[0]["kcl"]
        prev_ver = fixture_res.data[0].get("version", 1)

    # Create the study record
    study_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    sb.table("studies").insert({
        "id": study_id,
        "project_id": project_id,
        "user_id": user_id,
        "base_prompt": body.base_prompt,
        "num_variations": body.num_variations,
        "status": "generating",
        "created_at": now,
    }).execute()

    # Queue a Celery task for each variation
    from app.tasks.generate_fixture import generate_fixture_task

    strategies = VARIATION_STRATEGIES[: body.num_variations]
    variation_records = []

    for idx, (label, objective) in enumerate(strategies):
        if prev_kcl:
            prompt = (
                f"BASE REQUEST: {body.base_prompt}\n\n"
                f"DESIGN OBJECTIVE: {objective}\n\n"
                f"PREVIOUS FIXTURE (v{prev_ver}) KCL CODE:\n"
                f"```kcl\n{prev_kcl}\n```\n\n"
                f"Generate a new fixture variation that accomplishes the base request "
                f"while specifically optimizing for: {objective}. "
                f"Preserve the overall fixture concept but adapt the design accordingly."
            )
        else:
            prompt = (
                f"BASE REQUEST: {body.base_prompt}\n\n"
                f"DESIGN OBJECTIVE: {objective}\n\n"
                f"Generate a fixture design that accomplishes the base request "
                f"while specifically optimizing for: {objective}."
            )

        variation_id = str(uuid.uuid4())
        job = generate_fixture_task.apply_async(
            args=[project_id, prompt],
            queue="normal",
        )

        variation_records.append({
            "id": variation_id,
            "study_id": study_id,
            "project_id": project_id,
            "variation_index": idx,
            "variation_label": label,
            "prompt": prompt,
            "status": "pending",
            "fixture_id": None,
            "job_id": job.id,
            "created_at": now,
        })

    # Bulk insert variation records
    if variation_records:
        sb.table("study_variations").insert(variation_records).execute()

    log.info("Study created study=%s project=%s variations=%d", study_id, project_id, len(variation_records))
    return {
        "id": study_id,
        "project_id": project_id,
        "base_prompt": body.base_prompt,
        "num_variations": body.num_variations,
        "status": "generating",
        "created_at": now,
        "variations": [
            {
                "id": v["id"],
                "variation_index": v["variation_index"],
                "variation_label": v["variation_label"],
                "status": v["status"],
                "job_id": v["job_id"],
            }
            for v in variation_records
        ],
    }


@router.get("/{project_id}/studies")
async def list_studies(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all studies for a project."""
    sb = get_supabase_client()

    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    res = (
        sb.table("studies")
        .select("*")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .execute()
    )
    return {"studies": res.data or []}


@router.get("/{project_id}/studies/{study_id}")
async def get_study(
    project_id: str,
    study_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Get a study with all variation results.
    Checks Celery task status for pending variations and updates DB lazily.
    """
    sb = get_supabase_client()

    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    study_res = (
        sb.table("studies")
        .select("*")
        .eq("id", study_id)
        .eq("project_id", project_id)
        .execute()
    )
    if not study_res.data:
        raise HTTPException(404, "Study not found")
    study = study_res.data[0]

    vars_res = (
        sb.table("study_variations")
        .select("*")
        .eq("study_id", study_id)
        .order("variation_index")
        .execute()
    )
    variations = vars_res.data or []

    # Lazily resolve completed Celery tasks
    from celery.result import AsyncResult

    any_updated = False
    for v in variations:
        if v.get("status") == "pending" and v.get("job_id"):
            try:
                ar = AsyncResult(v["job_id"])
                if ar.successful():
                    fixture_id = (ar.result or {}).get("fixture_id")
                    sb.table("study_variations").update({
                        "status": "done",
                        "fixture_id": fixture_id,
                    }).eq("id", v["id"]).execute()
                    v["status"] = "done"
                    v["fixture_id"] = fixture_id
                    any_updated = True
                elif ar.failed():
                    sb.table("study_variations").update({"status": "failed"}).eq("id", v["id"]).execute()
                    v["status"] = "failed"
                    any_updated = True
            except Exception as e:
                log.warning("Could not check task status for variation %s: %s", v["id"], e)

    # Update study status if all variations have resolved
    if any_updated:
        all_resolved = all(v.get("status") in ("done", "failed") for v in variations)
        if all_resolved and study.get("status") == "generating":
            sb.table("studies").update({"status": "done"}).eq("id", study_id).execute()
            study["status"] = "done"

    # Attach fixture details for completed variations
    for v in variations:
        if v.get("fixture_id"):
            try:
                fx = (
                    sb.table("fixture_geometries")
                    .select("id,version,gltf_url,generated_at")
                    .eq("id", v["fixture_id"])
                    .single()
                    .execute()
                )
                v["fixture"] = fx.data
            except Exception:
                v["fixture"] = None

    return {**study, "variations": variations}
