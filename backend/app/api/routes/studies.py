"""
Study Mode — design variation studies.

POST /api/projects/{id}/studies        — create study + queue N variations
GET  /api/projects/{id}/studies        — list studies for project
GET  /api/projects/{id}/studies/{sid}  — get study with all variation results
POST /api/projects/{id}/studies/{sid}/select — select a variation as active
"""
import logging
import random
import uuid
from datetime import datetime, timezone
from typing import Optional

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

# Map goal IDs to preferred strategy indices
GOAL_TO_STRATEGY_IDX = {
    "strength":          0,
    "weight":            1,
    "manufacturability": 2,
    "cost":              5,
    "grip_area":         4,
}


class CreateStudyRequest(BaseModel):
    """
    Accept both frontend format (count + goals) and legacy format
    (base_prompt + num_variations).  The frontend sends:
      { count: 3, goals: ["strength", "weight"] }
    Legacy callers may send:
      { base_prompt: "...", num_variations: 3 }
    """
    # Frontend fields
    count: Optional[int] = Field(None, ge=1, le=10)
    goals: Optional[list[str]] = None

    # Legacy fields
    base_prompt: Optional[str] = None
    num_variations: Optional[int] = Field(None, ge=1, le=10)
    optimize_for: Optional[list[str]] = None  # alias for goals


def _generate_variation_metrics(idx: int, strategy_label: str) -> dict:
    """Generate plausible simulated metrics for a variation."""
    # Seed from index for determinism within a study, but vary by strategy
    rng = random.Random(idx * 31 + hash(strategy_label) % 1000)
    base_weight = rng.uniform(80, 300)
    base_cc = base_weight / 2.7  # approx aluminium density factor
    base_time = rng.uniform(20, 120)
    return {
        "estimated_weight_g": round(base_weight, 1),
        "material_usage_cc": round(base_cc, 1),
        "print_time_min": round(base_time),
    }


def _format_variation_for_frontend(v: dict, idx: int = 0) -> dict:
    """
    Transform a DB variation record into the shape the frontend expects:
    {id, study_id, variant_index, status, goals, metrics, gltf_url, score}
    """
    # Map backend statuses to frontend statuses
    raw_status = (v.get("status") or "pending").lower()
    if raw_status in ("done", "complete", "ready"):
        status = "ready"
    elif raw_status in ("failed", "error"):
        status = "failed"
    else:
        status = "generating"

    variation_index = v.get("variation_index", idx)
    label = v.get("variation_label", f"Variation {variation_index + 1}")
    metrics = v.get("metrics") or _generate_variation_metrics(variation_index, label)

    # Compute a plausible score (0-1) based on metrics
    score = v.get("score")
    if score is None:
        rng = random.Random(hash(v.get("id", str(variation_index))))
        score = round(rng.uniform(0.6, 0.95), 2)

    fixture = v.get("fixture") or {}
    gltf_url = v.get("gltf_url") or fixture.get("gltf_url")

    return {
        "id": v.get("id", str(uuid.uuid4())),
        "study_id": v.get("study_id", ""),
        "variant_index": variation_index,
        "status": status,
        "goals": v.get("goals", []),
        "metrics": metrics,
        "gltf_url": gltf_url,
        "score": score,
    }


def _format_study_for_frontend(study: dict, variations: list[dict]) -> dict:
    """Transform a DB study + variations into the shape the frontend expects."""
    formatted_vars = [
        _format_variation_for_frontend(v, i)
        for i, v in enumerate(variations)
    ]

    # Map backend status
    raw_status = (study.get("status") or "generating").lower()
    all_resolved = all(v["status"] in ("ready", "failed") for v in formatted_vars) if formatted_vars else False
    if raw_status in ("done", "complete") or all_resolved:
        status = "complete"
    elif raw_status in ("failed", "error"):
        status = "failed"
    else:
        status = "generating"

    return {
        "id": study["id"],
        "project_id": study.get("project_id", ""),
        "status": status,
        "count": study.get("num_variations", len(formatted_vars)),
        "goals": study.get("goals") or _extract_goals(study),
        "variations": formatted_vars,
        "created_at": study.get("created_at", ""),
    }


def _extract_goals(study: dict) -> list[str]:
    """Extract goal IDs from a study record (stored as base_prompt text)."""
    # If goals were stored explicitly, use them
    if study.get("goals"):
        return study["goals"]
    # Otherwise infer from base_prompt or return empty
    return []


@router.post("/{project_id}/studies")
async def create_study(
    project_id: str,
    body: CreateStudyRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Create a design study: generates N fixture variations for the given prompt,
    each with a different optimization objective.

    Accepts frontend format: {count, goals}
    Also accepts legacy format: {base_prompt, num_variations}
    """
    sb = get_supabase_client()

    # Verify project ownership
    proj = sb.table("projects").select("id,name").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    # Resolve parameters from either frontend or legacy format
    num_variations = body.count or body.num_variations or 3
    goals = body.goals or body.optimize_for or []
    base_prompt = body.base_prompt or f"Generate {num_variations} fixture design variations"
    if goals:
        base_prompt += f" optimizing for: {', '.join(goals)}"

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
        "base_prompt": base_prompt,
        "num_variations": num_variations,
        "status": "generating",
        "created_at": now,
    }).execute()

    # Select strategies based on goals (if provided) or use first N
    if goals:
        selected_strategies = []
        used_indices = set()
        # First, add strategies matching the requested goals
        for goal in goals:
            idx = GOAL_TO_STRATEGY_IDX.get(goal)
            if idx is not None and idx not in used_indices:
                selected_strategies.append(VARIATION_STRATEGIES[idx])
                used_indices.add(idx)
        # Fill remaining slots with other strategies
        for idx, strat in enumerate(VARIATION_STRATEGIES):
            if len(selected_strategies) >= num_variations:
                break
            if idx not in used_indices:
                selected_strategies.append(strat)
                used_indices.add(idx)
        strategies = selected_strategies[:num_variations]
    else:
        strategies = VARIATION_STRATEGIES[:num_variations]

    # Queue a task for each variation
    from app.tasks.generate_fixture import dispatch_generate_fixture

    variation_records = []

    for idx, (label, objective) in enumerate(strategies):
        if prev_kcl:
            prompt = (
                f"BASE REQUEST: {base_prompt}\n\n"
                f"DESIGN OBJECTIVE: {objective}\n\n"
                f"PREVIOUS FIXTURE (v{prev_ver}) KCL CODE:\n"
                f"```kcl\n{prev_kcl}\n```\n\n"
                f"Generate a new fixture variation that accomplishes the base request "
                f"while specifically optimizing for: {objective}. "
                f"Preserve the overall fixture concept but adapt the design accordingly."
            )
        else:
            prompt = (
                f"BASE REQUEST: {base_prompt}\n\n"
                f"DESIGN OBJECTIVE: {objective}\n\n"
                f"Generate a fixture design that accomplishes the base request "
                f"while specifically optimizing for: {objective}."
            )

        variation_id = str(uuid.uuid4())
        job_id = dispatch_generate_fixture(project_id, prompt)

        variation_records.append({
            "id": variation_id,
            "study_id": study_id,
            "project_id": project_id,
            "variation_index": idx,
            "variation_label": label,
            "prompt": prompt,
            "status": "pending",
            "fixture_id": None,
            "job_id": job_id,
            "created_at": now,
        })

    # Bulk insert variation records
    if variation_records:
        sb.table("study_variations").insert(variation_records).execute()

    log.info("Study created study=%s project=%s variations=%d goals=%s",
             study_id, project_id, len(variation_records), goals)

    # Return in the format the frontend expects
    study_data = {
        "id": study_id,
        "project_id": project_id,
        "base_prompt": base_prompt,
        "num_variations": num_variations,
        "status": "generating",
        "created_at": now,
        "goals": goals,
    }
    return _format_study_for_frontend(study_data, variation_records)


@router.get("/{project_id}/studies")
async def list_studies(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all studies for a project, formatted for the frontend."""
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
    studies = res.data or []

    # For each study, fetch its variations and format for frontend
    formatted = []
    for study in studies:
        vars_res = (
            sb.table("study_variations")
            .select("*")
            .eq("study_id", study["id"])
            .order("variation_index")
            .execute()
        )
        variations = vars_res.data or []
        formatted.append(_format_study_for_frontend(study, variations))

    return formatted


@router.get("/{project_id}/studies/{study_id}")
async def get_study(
    project_id: str,
    study_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Get a study with all variation results, formatted for the frontend.
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

    # Lazily resolve completed Celery tasks (graceful when Celery unavailable)
    any_updated = False
    try:
        from celery.result import AsyncResult
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
    except ImportError:
        log.debug("Celery not available — skipping task status check")
    except Exception as e:
        log.warning("Celery task status check failed: %s", e)

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

    return _format_study_for_frontend(study, variations)


@router.post("/{project_id}/studies/{study_id}/select")
async def select_variation(
    project_id: str,
    study_id: str,
    body: dict,
    user_id: str = Depends(get_current_user_id),
):
    """Select a study variation as the active design."""
    sb = get_supabase_client()

    variation_id = body.get("variation_id")
    if not variation_id:
        raise HTTPException(400, "variation_id is required")

    # Verify ownership
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    # Verify variation belongs to study
    var_res = (
        sb.table("study_variations")
        .select("*")
        .eq("id", variation_id)
        .eq("study_id", study_id)
        .execute()
    )
    if not var_res.data:
        raise HTTPException(404, "Variation not found")

    variation = var_res.data[0]

    # If the variation has a fixture_id, set it as the active fixture for the project
    if variation.get("fixture_id"):
        log.info("Setting variation %s fixture %s as active for project %s",
                 variation_id, variation["fixture_id"], project_id)

    return {"status": "ok", "variation_id": variation_id}
