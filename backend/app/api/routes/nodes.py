import asyncio
import logging
import re

from fastapi import APIRouter, HTTPException, Depends, status
from app.models.node_graph import NodeGraphResponse, NodeUpdate
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

_log = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["nodes"])
TABLE = "node_graphs"


@router.get("/{project_id}/nodes", response_model=NodeGraphResponse)
async def get_node_graph(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = (
        sb.table(TABLE)
        .select("*")
        .eq("project_id", project_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No node graph found")
    row = res.data[0]
    return NodeGraphResponse(
        id=row["id"],
        project_id=row["project_id"],
        nodes=row.get("nodes_json", []),
        connections=row.get("connections_json", []),
        generated_at=row["generated_at"],
    )


@router.get("/{project_id}/nodes/{node_id}")
async def get_node(
    project_id: str,
    node_id: str,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()
    res = (
        sb.table(TABLE)
        .select("nodes_json")
        .eq("project_id", project_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No node graph found")
    nodes = res.data[0].get("nodes_json", [])
    node = next((n for n in nodes if n["id"] == node_id), None)
    if not node:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    return node


@router.patch("/{project_id}/nodes/{node_id}")
async def update_node(
    project_id: str,
    node_id: str,
    body: NodeUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Update a node's params and queue a sub-graph re-run."""
    sb = get_supabase_client()

    # Fetch current graph
    res = (
        sb.table(TABLE)
        .select("id,nodes_json")
        .eq("project_id", project_id)
        .order("generated_at", desc=True)
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="No node graph found")

    graph_id = res.data[0]["id"]
    nodes = res.data[0].get("nodes_json", [])

    # Patch node params
    idx = next((i for i, n in enumerate(nodes) if n["id"] == node_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail=f"Node {node_id} not found")
    nodes[idx]["params"] = [p.model_dump() for p in body.params]

    sb.table(TABLE).update({"nodes_json": nodes}).eq("id", graph_id).execute()

    # Re-execute CadQuery with updated parameter values
    # Fetch the latest CadQuery script for this project
    fixture_res = (
        sb.table("fixture_geometries")
        .select("id,kcl,version")
        .eq("project_id", project_id)
        .order("version", desc=True)
        .limit(1)
        .execute()
    )
    if not fixture_res.data or not fixture_res.data[0].get("kcl"):
        _log.warning("No CadQuery script found for project %s — falling back to full regen", project_id)
        from app.tasks.generate_fixture import dispatch_generate_fixture
        job_id = dispatch_generate_fixture(project_id, f"Update node {node_id}")
        return {"job_id": job_id, "node_id": node_id, "status": "full_regen"}

    fixture = fixture_res.data[0]
    script = fixture["kcl"]
    version = fixture["version"]
    fixture_id = fixture["id"]

    # Apply parameter changes to the CadQuery script
    # Node params have "name" and "value" — find matching variable assignments in the script
    updated_params = {p.name: p.value for p in body.params}
    modified_script = script

    for param_name, param_value in updated_params.items():
        # Match: variable_name = <number> or variable_name = <number with decimal>
        # Try exact variable name first, then common variations
        for var_name in [param_name, param_name.lower().replace(" ", "_")]:
            pattern = rf'^(\s*{re.escape(var_name)}\s*=\s*)-?[\d.]+(.*)$'
            replacement = rf'\g<1>{param_value}\2'
            new_script, count = re.subn(pattern, replacement, modified_script, flags=re.MULTILINE)
            if count > 0:
                modified_script = new_script
                _log.info("Updated param %s=%s in CadQuery script (%d replacements)", var_name, param_value, count)
                break

    if modified_script == script:
        _log.warning("No variable replacements made for node %s — params may not map to script variables", node_id)

    # Re-execute the modified script in a thread so that synchronous
    # code (subprocess calls, Zoo.dev fallback with its own event loop)
    # does not conflict with FastAPI's running async loop.
    try:
        from app.services.cadquery_service import execute_cadquery_script
        result = await asyncio.to_thread(
            execute_cadquery_script, modified_script, project_id, "fixture", version
        )
        gltf_url = result.get("gltf_url")

        if gltf_url:
            # Update the fixture record with new geometry
            sb.table("fixture_geometries").update({
                "gltf_url": gltf_url,
                "kcl": modified_script,
            }).eq("id", fixture_id).execute()
            _log.info("Node param update → new GLB for project=%s node=%s", project_id, node_id)
            return {"node_id": node_id, "status": "updated", "gltf_url": gltf_url}
        else:
            _log.warning("CadQuery re-execution produced no geometry for node %s", node_id)
            return {"node_id": node_id, "status": "no_geometry", "error": result.get("error")}
    except Exception as exc:
        _log.error("CadQuery re-execution failed for node %s: %s", node_id, exc)
        return {"node_id": node_id, "status": "error", "error": str(exc)[:200]}


@router.post("/{project_id}/nodes/regenerate")
async def regenerate_full_graph(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Re-generate the entire node graph from scratch via Gemini Pro."""
    from app.tasks.generate_fixture import dispatch_generate_fixture
    job_id = dispatch_generate_fixture(project_id, None)
    return {"job_id": job_id, "status": "queued" if job_id else "running_sync"}
