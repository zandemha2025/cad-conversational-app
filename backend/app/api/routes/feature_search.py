"""
Feature Search API.

Provides search and listing of CAD features extracted from part_geometries.features_json.
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

router = APIRouter(prefix="/projects", tags=["features"])


def _extract_features(features_json: dict) -> list[dict]:
    """Flatten features_json into a searchable list of feature items."""
    items = []

    # Faces
    for face in features_json.get("faces", []):
        fid = face.get("id", f"face_{len(items):03d}")
        normal = face.get("normal", [])
        items.append({
            "id": fid,
            "type": "face",
            "name": f"Face {fid}",
            "params": {
                "area_mm2": face.get("area_mm2"),
                "normal": normal,
                "is_planar": face.get("is_planar", False),
                "is_datum_candidate": face.get("is_datum_candidate", False),
            },
            "location": face.get("centroid"),
            "dependencies": ["bounding_box"] if face.get("is_datum_candidate") else [],
        })

    # Holes
    for i, hole in enumerate(features_json.get("detected_holes", [])):
        dia = hole.get("diameter", 0)
        depth = hole.get("depth", 0)
        items.append({
            "id": f"hole_{i:03d}",
            "type": "hole",
            "name": f"Hole Ø{dia:.1f}mm",
            "params": {
                "diameter_mm": dia,
                "depth_mm": depth,
                "axis": hole.get("axis"),
                "is_through_hole": depth >= features_json.get("bounding_box", {}).get("z", 0) - 0.1,
            },
            "location": hole.get("center"),
            "dependencies": [],
        })

    # Bounding box (summary feature)
    bb = features_json.get("bounding_box")
    if bb:
        x, y, z = bb.get("x", 0), bb.get("y", 0), bb.get("z", 0)
        items.append({
            "id": "bounding_box",
            "type": "bounding_box",
            "name": f"Bounding Box {x:.0f}×{y:.0f}×{z:.0f}mm",
            "params": {
                "x_mm": x,
                "y_mm": y,
                "z_mm": z,
                "volume_mm3": features_json.get("volume_mm3"),
                "surface_area_mm2": features_json.get("surface_area_mm2"),
            },
            "location": [x / 2, y / 2, z / 2],
            "dependencies": [],
        })

    # Summary feature
    items.append({
        "id": "geometry_summary",
        "type": "summary",
        "name": "Geometry Summary",
        "params": {
            "face_count": features_json.get("face_count", 0),
            "edge_count": features_json.get("edge_count", 0),
            "hole_count": features_json.get("hole_count", 0),
            "volume_mm3": features_json.get("volume_mm3"),
            "surface_area_mm2": features_json.get("surface_area_mm2"),
        },
        "location": None,
        "dependencies": [],
    })

    return items


def _feature_matches(feature: dict, q: str) -> bool:
    """Return True if the feature matches the search query (case-insensitive)."""
    q_lower = q.lower()
    if q_lower in feature.get("name", "").lower():
        return True
    if q_lower in feature.get("type", "").lower():
        return True
    if q_lower in feature.get("id", "").lower():
        return True
    params = feature.get("params", {})
    for k, v in params.items():
        if q_lower in str(k).lower():
            return True
        if v is not None and q_lower in str(v).lower():
            return True
    return False


def _get_features_json(project_id: str) -> tuple[dict | None, str]:
    """Fetch the latest features_json for a project. Returns (features_json, status)."""
    sb = get_supabase_client()
    res = (
        sb.table("part_geometries")
        .select("features_json,processing_status")
        .eq("project_id", project_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = res.data or []
    if not rows:
        return None, "no_geometry"
    row = rows[0]
    if not row.get("features_json"):
        return None, row.get("processing_status", "pending")
    return row["features_json"], "ready"


# ── List all features ──────────────────────────────────────────────────────────

@router.get("/{project_id}/features")
async def list_features(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """List all features extracted from the project's part geometry."""
    features_json, status = _get_features_json(project_id)
    if features_json is None:
        return {"features": [], "total": 0, "status": status}
    items = _extract_features(features_json)
    return {"features": items, "total": len(items), "status": status}


# ── Search features ────────────────────────────────────────────────────────────

@router.get("/{project_id}/features/search")
async def search_features(
    project_id: str,
    q: str = Query(..., min_length=1, description="Search term — name, type, or parameter value"),
    user_id: str = Depends(get_current_user_id),
):
    """Search through part geometry features by name, type, or parameter value."""
    features_json, status = _get_features_json(project_id)
    if features_json is None:
        return {"results": [], "query": q, "total": 0, "status": status}
    all_features = _extract_features(features_json)
    matches = [f for f in all_features if _feature_matches(f, q)]
    return {"results": matches, "query": q, "total": len(matches), "status": "ready"}


# ── Get single feature ─────────────────────────────────────────────────────────

@router.get("/{project_id}/features/{feature_id}")
async def get_feature(
    project_id: str,
    feature_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get details of a specific feature by ID."""
    features_json, status = _get_features_json(project_id)
    if features_json is None:
        raise HTTPException(status_code=404, detail=f"No geometry found for project (status: {status})")
    all_features = _extract_features(features_json)
    for f in all_features:
        if f["id"] == feature_id:
            return f
    raise HTTPException(status_code=404, detail=f"Feature '{feature_id}' not found")
