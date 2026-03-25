"""
Interference / collision detection route.
POST /api/projects/{id}/interference-check
GET  /api/projects/{id}/interference-check/latest
"""
from fastapi import APIRouter, Depends, HTTPException
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from datetime import datetime, timezone
import uuid
import math
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/projects", tags=["interference"])


def _compute_aabb(coords: list) -> dict:
    """Compute axis-aligned bounding box from a list of [x,y,z] coordinate triplets."""
    if not coords:
        return {"min": [0, 0, 0], "max": [0, 0, 0]}
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    zs = [c[2] for c in coords]
    return {
        "min": [min(xs), min(ys), min(zs)],
        "max": [max(xs), max(ys), max(zs)],
    }


def _aabb_overlap(a: dict, b: dict) -> bool:
    """Return True if two AABBs overlap."""
    for i in range(3):
        if a["max"][i] <= b["min"][i] or b["max"][i] <= a["min"][i]:
            return False
    return True


def _overlap_volume(a: dict, b: dict) -> float:
    """Compute approximate overlap volume of two AABBs."""
    vol = 1.0
    for i in range(3):
        overlap = min(a["max"][i], b["max"][i]) - max(a["min"][i], b["min"][i])
        if overlap <= 0:
            return 0.0
        vol *= overlap
    return vol


@router.post("/{project_id}/interference-check")
async def run_interference_check(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """
    Run interference / collision detection on project geometry.

    Uses touchpoint coordinates and part feature geometry to detect
    overlapping volumes between fixture components.
    """
    sb = get_supabase_client()

    # Verify project ownership
    proj = sb.table("projects").select("id,name").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    # Fetch touchpoints as "parts" with coordinate data
    tp_res = sb.table("touchpoints").select("*").eq("project_id", project_id).execute()
    touchpoints = tp_res.data or []

    # Fetch part geometry features for bounding box computation
    geom_res = (
        sb.table("part_geometries")
        .select("features_json,processing_status")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    features = []
    if geom_res.data and geom_res.data[0].get("features_json"):
        fj = geom_res.data[0]["features_json"]
        if isinstance(fj, dict):
            features = fj.get("faces", []) or fj.get("features", []) or []
        elif isinstance(fj, list):
            features = fj

    # Build "parts" list for interference checking
    # Each part has a bounding box derived from touchpoint coords or feature data
    parts = []

    # Add touchpoints as fixture elements with small bounding boxes
    for tp in touchpoints:
        coords_j = tp.get("coords_json", {})
        if isinstance(coords_j, dict):
            cx = coords_j.get("x", 0)
            cy = coords_j.get("y", 0)
            cz = coords_j.get("z", 0)
        else:
            cx, cy, cz = 0, 0, 0

        tp_type = tp.get("type", "support")
        # Fixture element sizes: locating=8mm pin, clamping=15mm clamp, support=10mm rest
        r = {"locating": 4, "clamping": 7.5, "support": 5}.get(tp_type, 5)

        parts.append({
            "id": tp["id"],
            "label": tp.get("label", "Touchpoint"),
            "type": tp_type,
            "aabb": {
                "min": [cx - r, cy - r, cz - r],
                "max": [cx + r, cy + r, cz + r],
            },
        })

    # Check all pairs for interference
    interfering_pairs = []
    total_pairs = 0

    for i in range(len(parts)):
        for j in range(i + 1, len(parts)):
            total_pairs += 1
            a, b = parts[i], parts[j]
            if _aabb_overlap(a["aabb"], b["aabb"]):
                overlap_vol = _overlap_volume(a["aabb"], b["aabb"])
                interfering_pairs.append({
                    "part_a": {"id": a["id"], "label": a["label"], "type": a["type"]},
                    "part_b": {"id": b["id"], "label": b["label"], "type": b["type"]},
                    "overlap_volume_mm3": round(overlap_vol, 4),
                    "severity": "error" if overlap_vol > 100 else "warning",
                    "description": (
                        f"{a['label']} and {b['label']} overlap by "
                        f"{overlap_vol:.2f} mm³. Adjust positions to avoid collision."
                    ),
                })

    # If no touchpoints but has features, add synthetic bounding box check
    if not parts and features:
        # Use part features to generate mock bounding volumes
        mock_parts = []
        for i, feat in enumerate(features[:10]):  # limit to first 10 features
            if isinstance(feat, dict):
                centroid = feat.get("centroid", [i * 20, 0, 0])
                if isinstance(centroid, (list, tuple)) and len(centroid) >= 3:
                    cx, cy, cz = centroid[0], centroid[1], centroid[2]
                    r = feat.get("radius", 10) if "radius" in feat else 10
                    mock_parts.append({
                        "id": str(i),
                        "label": feat.get("label", f"Feature {i+1}"),
                        "type": "feature",
                        "aabb": {
                            "min": [cx - r, cy - r, cz - r],
                            "max": [cx + r, cy + r, cz + r],
                        },
                    })

        for i in range(len(mock_parts)):
            for j in range(i + 1, len(mock_parts)):
                total_pairs += 1
                a, b = mock_parts[i], mock_parts[j]
                if _aabb_overlap(a["aabb"], b["aabb"]):
                    overlap_vol = _overlap_volume(a["aabb"], b["aabb"])
                    interfering_pairs.append({
                        "part_a": {"id": a["id"], "label": a["label"], "type": a["type"]},
                        "part_b": {"id": b["id"], "label": b["label"], "type": b["type"]},
                        "overlap_volume_mm3": round(overlap_vol, 4),
                        "severity": "error" if overlap_vol > 100 else "warning",
                        "description": (
                            f"{a['label']} and {b['label']} overlap by "
                            f"{overlap_vol:.2f} mm³."
                        ),
                    })

    result = {
        "project_id": project_id,
        "total_pairs_checked": total_pairs,
        "interfering_pairs": len(interfering_pairs),
        "status": "clean" if not interfering_pairs else "interference_detected",
        "ran_at": datetime.now(timezone.utc).isoformat(),
        "parts_checked": len(parts),
        "issues": interfering_pairs,
        "summary": (
            f"No interference detected between {total_pairs} part pairs."
            if not interfering_pairs
            else f"Detected {len(interfering_pairs)} interference(s) out of {total_pairs} pairs checked."
        ),
    }

    # Persist results
    run_id = str(uuid.uuid4())
    try:
        sb.table("interference_results").insert({
            "id": run_id,
            "project_id": project_id,
            "results_json": interfering_pairs,
            "total_pairs": total_pairs,
            "interfering_pairs": len(interfering_pairs),
            "ran_at": result["ran_at"],
        }).execute()
    except Exception as e:
        log.warning("Could not persist interference results: %s", e)

    return result


@router.get("/{project_id}/interference-check/latest")
async def get_latest_interference(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get the latest cached interference check results."""
    sb = get_supabase_client()
    proj = sb.table("projects").select("id").eq("id", project_id).eq("user_id", user_id).execute()
    if not proj.data:
        raise HTTPException(404, "Project not found")

    res = (
        sb.table("interference_results")
        .select("*")
        .eq("project_id", project_id)
        .order("ran_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        return {"project_id": project_id, "status": "not_run", "issues": []}
    return res.data[0]
