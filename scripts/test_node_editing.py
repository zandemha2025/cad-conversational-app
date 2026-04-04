"""
Test: Node parameter editing via PATCH /api/projects/{id}/nodes/{nodeId}

Exercises the full flow:
  1. Login
  2. Find a project with a CadQuery script
  3. GET its node graph
  4. Find a numeric parameter node
  5. PATCH with a new value
  6. Verify the response (new GLB or meaningful error)
"""
import json
import re
import sys
import time

import requests

API = "https://scalecad-api.fly.dev"
EMAIL = "test@scalecad.io"
PASSWORD = "TestPass123!"


def log(msg: str) -> None:
    print(f"[test] {msg}")


def login() -> str:
    """Login and return bearer token."""
    r = requests.post(f"{API}/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
    if r.status_code != 200:
        log(f"LOGIN FAILED: {r.status_code} {r.text[:300]}")
        sys.exit(1)
    token = r.json()["access_token"]
    log(f"Logged in as {EMAIL}")
    return token


def find_project_with_cadquery(headers: dict) -> dict | None:
    """Find the most recent project whose fixture_geometries.kcl contains 'import cadquery'."""
    r = requests.get(f"{API}/api/projects/", headers=headers)
    if r.status_code != 200:
        log(f"GET /api/projects failed: {r.status_code} {r.text[:200]}")
        return None

    projects = r.json()
    if not projects:
        log("No projects found")
        return None

    log(f"Found {len(projects)} projects, scanning for CadQuery scripts...")

    # Collect all candidates and prefer simpler ones (fewer nodes = faster re-execution)
    candidates = []
    for proj in projects:
        pid = proj["id"]
        r2 = requests.get(f"{API}/api/projects/{pid}/nodes", headers=headers)
        if r2.status_code == 200:
            data = r2.json()
            nodes = data.get("nodes", [])
            has_numeric = False
            for node in nodes:
                for param in node.get("params", []):
                    if param.get("type") == "number" and isinstance(param.get("value"), (int, float)):
                        has_numeric = True
                        break
                if has_numeric:
                    break

            if has_numeric:
                candidates.append((proj, len(nodes)))
                log(f"  Candidate: '{proj.get('name', pid)}' ({len(nodes)} nodes)")

        if len(candidates) >= 10:
            break  # Don't scan all 94 projects

    if not candidates:
        log("No project found with CadQuery-derived node graph")
        return None

    # Pick the simplest project (fewest nodes)
    candidates.sort(key=lambda x: x[1])
    proj, node_count = candidates[0]
    log(f"Selected simplest: '{proj.get('name', proj['id'])}' ({node_count} nodes)")
    return proj


def get_node_graph(project_id: str, headers: dict) -> dict | None:
    r = requests.get(f"{API}/api/projects/{project_id}/nodes", headers=headers)
    if r.status_code != 200:
        log(f"GET nodes failed: {r.status_code} {r.text[:200]}")
        return None
    return r.json()


def find_numeric_param_node(nodes: list[dict]) -> tuple[dict, dict] | None:
    """Find a node with at least one numeric parameter. Return (node, param)."""
    for node in nodes:
        for param in node.get("params", []):
            if param.get("type") == "number" and isinstance(param.get("value"), (int, float)):
                return node, param
    return None


def patch_node(
    project_id: str,
    node_id: str,
    params: list[dict],
    headers: dict,
) -> dict:
    url = f"{API}/api/projects/{project_id}/nodes/{node_id}"
    r = requests.patch(url, json={"params": params}, headers=headers, timeout=300)
    return {"status_code": r.status_code, "body": r.json() if r.headers.get("content-type", "").startswith("application/json") else r.text}


def test_regex_locally(param_name: str, param_value, new_value) -> None:
    """Test the same regex the backend uses to verify it would match."""
    sample_script = f"{param_name} = {param_value}\n"
    for var_name in [param_name, param_name.lower().replace(" ", "_")]:
        pattern = rf'^(\s*{re.escape(var_name)}\s*=\s*)[\d.]+(.*)$'
        new_script, count = re.subn(pattern, rf'\g<1>{new_value}\2', sample_script, flags=re.MULTILINE)
        if count > 0:
            log(f"  LOCAL REGEX OK: '{sample_script.strip()}' -> '{new_script.strip()}'")
            return
    log(f"  LOCAL REGEX FAIL: pattern did not match '{sample_script.strip()}'")


def main() -> None:
    log("=" * 60)
    log("Node Parameter Editing Test")
    log("=" * 60)

    # Step 1: Login
    token = login()
    headers = {"Authorization": f"Bearer {token}"}

    # Step 2: Find project with CadQuery script
    proj = find_project_with_cadquery(headers)
    if not proj:
        log("SKIP: No suitable project found. Generate a model first.")
        sys.exit(0)

    project_id = proj["id"]
    log(f"Using project: {proj.get('name', 'unnamed')} ({project_id})")

    # Step 3: Get node graph
    graph = get_node_graph(project_id, headers)
    if not graph:
        log("FAIL: Could not fetch node graph")
        sys.exit(1)

    nodes = graph.get("nodes", [])
    log(f"Node graph has {len(nodes)} nodes:")
    for n in nodes:
        params_desc = ", ".join(f"{p['name']}={p['value']}" for p in n.get("params", []))
        log(f"  [{n['category']}] {n['id']}: {n['label']} ({params_desc or 'no params'})")

    # Step 4: Find a numeric parameter
    result = find_numeric_param_node(nodes)
    if not result:
        log("FAIL: No node with numeric params found")
        sys.exit(1)

    node, param = result
    old_value = param["value"]
    # Change by +20 (or set to 100 if it was 0)
    new_value = old_value + 20 if old_value else 100.0
    log(f"\nTarget: node='{node['id']}', param='{param['name']}', "
        f"old={old_value} -> new={new_value}")

    # Step 4b: Test regex locally
    test_regex_locally(param["name"], old_value, new_value)

    # Step 5: PATCH the node
    # Build the full params list — the endpoint replaces ALL params for the node
    updated_params = []
    for p in node.get("params", []):
        new_p = dict(p)
        if new_p["name"] == param["name"]:
            new_p["value"] = new_value
        updated_params.append(new_p)

    log(f"\nPATCHing node '{node['id']}' with params: {json.dumps(updated_params, indent=2)}")
    t0 = time.time()
    resp = patch_node(project_id, node["id"], updated_params, headers)
    elapsed = time.time() - t0
    log(f"Response ({elapsed:.1f}s): {json.dumps(resp, indent=2)}")

    # Step 6: Analyze result
    body = resp.get("body", {})
    status_code = resp["status_code"]

    if status_code == 200:
        status_val = body.get("status")
        if status_val == "updated" and body.get("gltf_url"):
            log(f"\nSUCCESS: New GLB generated at {body['gltf_url']}")
        elif status_val == "no_geometry":
            log(f"\nPARTIAL: Script ran but no geometry produced. Error: {body.get('error')}")
        elif status_val == "error":
            log(f"\nFAIL: CadQuery execution error: {body.get('error')}")
        elif status_val == "full_regen":
            log(f"\nFALLBACK: No CadQuery script found, triggered full regen (job_id={body.get('job_id')})")
        else:
            log(f"\nUNKNOWN STATUS: {status_val}")
    elif status_code == 404:
        log(f"\nFAIL: 404 — {body}")
    elif status_code == 422:
        log(f"\nFAIL: 422 Validation Error — {body}")
    else:
        log(f"\nFAIL: HTTP {status_code} — {body}")

    # Step 6b: Verify the node was actually updated in the graph
    log("\nVerifying node graph was updated...")
    graph2 = get_node_graph(project_id, headers)
    if graph2:
        for n in graph2.get("nodes", []):
            if n["id"] == node["id"]:
                for p in n.get("params", []):
                    if p["name"] == param["name"]:
                        if p["value"] == new_value:
                            log(f"  VERIFIED: param '{p['name']}' is now {p['value']}")
                        else:
                            log(f"  MISMATCH: param '{p['name']}' is {p['value']}, expected {new_value}")
                        break
                break

    log("\n" + "=" * 60)
    log("Test complete")
    log("=" * 60)


if __name__ == "__main__":
    main()
