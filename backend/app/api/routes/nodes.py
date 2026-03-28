from fastapi import APIRouter, HTTPException, Depends, status
from app.models.node_graph import NodeGraphResponse, NodeUpdate
from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client

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

    # Queue sub-graph re-generation
    import logging as _logging
    from app.tasks.generate_fixture import regenerate_subgraph, dispatch_generate_fixture
    try:
        job = regenerate_subgraph.apply_async(args=[project_id, node_id], queue="normal")
        return {"job_id": job.id, "node_id": node_id, "status": "queued"}
    except Exception as exc:
        _logging.getLogger(__name__).warning("Celery unavailable (%s), running sync", exc)
        job_id = dispatch_generate_fixture(project_id, f"Update node {node_id}")
        return {"job_id": job_id, "node_id": node_id, "status": "queued" if job_id else "running_sync"}


@router.post("/{project_id}/nodes/regenerate")
async def regenerate_full_graph(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Re-generate the entire node graph from scratch via Gemini Pro."""
    from app.tasks.generate_fixture import dispatch_generate_fixture
    job_id = dispatch_generate_fixture(project_id, None)
    return {"job_id": job_id, "status": "queued" if job_id else "running_sync"}
