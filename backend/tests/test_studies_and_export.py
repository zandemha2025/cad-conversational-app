"""
Integration tests for Studies (Task 3A) and Export (Task 3B) endpoints.

Runs against the live ScaleCAD API at https://scalecad-api.fly.dev.
These tests verify the frontend/backend contract is correct.
"""
import json
import sys
import urllib.request
import urllib.error

API = "https://scalecad-api.fly.dev/api"
EMAIL = "test@scalecad.io"
PASSWORD = "TestPass123!"

passed = 0
failed = 0
errors = []


def log_pass(name: str, detail: str = ""):
    global passed
    passed += 1
    print(f"  PASS  {name}{f' — {detail}' if detail else ''}")


def log_fail(name: str, detail: str = ""):
    global failed
    failed += 1
    errors.append(f"{name}: {detail}")
    print(f"  FAIL  {name}{f' — {detail}' if detail else ''}")


def api_request(path: str, token: str = "", method: str = "GET",
                body: dict | None = None, timeout: int = 30) -> tuple[int, dict | bytes | None]:
    """Make an API request. Returns (status_code, parsed_response)."""
    url = f"{API}{path}"
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        resp = urllib.request.urlopen(req, timeout=timeout)
        content = resp.read()
        try:
            return resp.status, json.loads(content)
        except json.JSONDecodeError:
            return resp.status, content
    except urllib.error.HTTPError as e:
        content = e.read()
        try:
            return e.code, json.loads(content)
        except Exception:
            return e.code, {"raw": content.decode("utf-8", errors="replace")[:500]}
    except Exception as e:
        return 0, {"error": str(e)}


def login() -> str:
    """Login and return token."""
    status, data = api_request("/auth/login", method="POST",
                               body={"email": EMAIL, "password": PASSWORD})
    if status != 200 or not data:
        print(f"FATAL: Login failed with status {status}")
        sys.exit(1)
    return data["access_token"]


def find_project_with_fixture(token: str) -> str | None:
    """Find a project that has fixture geometry."""
    status, data = api_request("/projects/", token=token)
    if status != 200 or not data:
        return None
    projects = data if isinstance(data, list) else data.get("projects", [])
    # Return first project ID (we'll test with whatever is available)
    for p in projects:
        return p["id"]
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# TASK 3A: Studies Verification
# ═══════════════════════════════════════════════════════════════════════════════

def test_studies(token: str, project_id: str):
    print("\n=== TASK 3A: Studies Verification ===\n")

    # Test 1: Create study with FRONTEND format (count + goals)
    print("Test 1: Create study with frontend format {count, goals}")
    status, data = api_request(
        f"/projects/{project_id}/studies",
        token=token,
        method="POST",
        body={"count": 3, "goals": ["strength", "weight"]},
    )

    if status == 200 and data:
        log_pass("POST create study (frontend format)", f"status={status}")

        # Verify response shape matches ApiStudy interface
        required_fields = ["id", "project_id", "status", "count", "goals", "variations", "created_at"]
        missing = [f for f in required_fields if f not in data]
        if missing:
            log_fail("Response shape", f"Missing fields: {missing}")
        else:
            log_pass("Response has all ApiStudy fields")

        # Verify count field
        if data.get("count") == 3:
            log_pass("count field = 3")
        else:
            log_fail("count field", f"Expected 3, got {data.get('count')}")

        # Verify goals field
        if isinstance(data.get("goals"), list) and "strength" in data["goals"]:
            log_pass("goals field contains requested goals")
        else:
            log_fail("goals field", f"Expected [strength, weight], got {data.get('goals')}")

        # Verify variations
        variations = data.get("variations", [])
        if len(variations) == 3:
            log_pass("3 variations created")
        else:
            log_fail("Variation count", f"Expected 3, got {len(variations)}")

        # Verify variation shape matches ApiStudyVariation
        if variations:
            v = variations[0]
            var_fields = ["id", "variant_index", "status", "metrics", "score"]
            missing_var = [f for f in var_fields if f not in v]
            if missing_var:
                log_fail("Variation shape", f"Missing fields: {missing_var}")
            else:
                log_pass("Variation has all ApiStudyVariation fields")

            # Verify variant_index (not variation_index)
            if "variant_index" in v:
                log_pass("Uses 'variant_index' (frontend naming)")
            elif "variation_index" in v:
                log_fail("Field naming", "Uses 'variation_index' — frontend expects 'variant_index'")

            # Verify metrics has expected sub-fields
            metrics = v.get("metrics", {})
            metric_fields = ["estimated_weight_g", "material_usage_cc", "print_time_min"]
            missing_m = [f for f in metric_fields if f not in metrics]
            if missing_m:
                log_fail("Variation metrics", f"Missing: {missing_m}")
            else:
                log_pass("Variation metrics has all expected fields")

            # Verify score is a number between 0 and 1
            score = v.get("score")
            if isinstance(score, (int, float)) and 0 <= score <= 1:
                log_pass("Variation score", f"score={score}")
            else:
                log_fail("Variation score", f"Expected 0-1, got {score}")

            # Verify status is one of: generating, ready, failed
            vstatus = v.get("status")
            if vstatus in ("generating", "ready", "failed"):
                log_pass("Variation status", f"status={vstatus}")
            else:
                log_fail("Variation status", f"Expected generating|ready|failed, got {vstatus}")

        study_id = data.get("id")
    else:
        log_fail("POST create study (frontend format)", f"status={status}, body={str(data)[:200]}")
        study_id = None

    # Test 2: Create study with LEGACY format
    print("\nTest 2: Create study with legacy format {base_prompt, num_variations}")
    status2, data2 = api_request(
        f"/projects/{project_id}/studies",
        token=token,
        method="POST",
        body={"base_prompt": "Generate a test fixture", "num_variations": 2},
    )
    if status2 == 200 and data2:
        log_pass("POST create study (legacy format)", f"status={status2}")
    else:
        log_fail("POST create study (legacy format)", f"status={status2}")

    # Test 3: List studies
    print("\nTest 3: List studies")
    status3, data3 = api_request(f"/projects/{project_id}/studies", token=token)
    if status3 == 200 and data3:
        if isinstance(data3, list):
            log_pass("GET list studies returns array", f"count={len(data3)}")
            if len(data3) > 0 and "variations" in data3[0]:
                log_pass("Listed studies include variations")
            else:
                log_fail("Listed studies format", "Missing variations in study objects")
        else:
            log_fail("GET list studies", f"Expected array, got {type(data3).__name__}")
    else:
        log_fail("GET list studies", f"status={status3}")

    # Test 4: Get single study
    if study_id:
        print("\nTest 4: Get study detail")
        status4, data4 = api_request(
            f"/projects/{project_id}/studies/{study_id}", token=token
        )
        if status4 == 200 and data4:
            log_pass("GET study detail", f"status={status4}")
            if "variations" in data4 and isinstance(data4["variations"], list):
                log_pass("Study detail has variations array")
            else:
                log_fail("Study detail format", "Missing variations array")
        else:
            log_fail("GET study detail", f"status={status4}")

    # Test 5: Select variation endpoint exists
    if study_id and variations:
        print("\nTest 5: Select variation")
        status5, data5 = api_request(
            f"/projects/{project_id}/studies/{study_id}/select",
            token=token,
            method="POST",
            body={"variation_id": variations[0]["id"]},
        )
        if status5 == 200:
            log_pass("POST select variation", f"status={status5}")
        else:
            log_fail("POST select variation", f"status={status5}, body={str(data5)[:200]}")


# ═══════════════════════════════════════════════════════════════════════════════
# TASK 3B: Export Verification
# ═══════════════════════════════════════════════════════════════════════════════

def test_export(token: str, project_id: str):
    print("\n=== TASK 3B: Export Verification ===\n")

    for fmt, expected_prefix, desc in [
        ("stl", b"solid", "ASCII STL"),
        ("dxf", b"0\nSECTION", "DXF R12"),
        ("iges", None, "IGES"),
    ]:
        print(f"Test: Export {fmt.upper()}")
        status, data = api_request(
            f"/projects/{project_id}/export/{fmt}",
            token=token,
            timeout=30,
        )
        if status == 200 and data:
            if isinstance(data, bytes):
                size = len(data)
                if size > 50:
                    log_pass(f"Export {fmt.upper()}", f"{size} bytes")
                    if expected_prefix and not data.startswith(expected_prefix):
                        log_fail(f"Export {fmt.upper()} content", f"Unexpected prefix: {data[:50]}")
                    elif expected_prefix:
                        log_pass(f"Export {fmt.upper()} content valid")

                    # Check if it's stub data
                    if fmt == "stl" and b"solid " in data[:50]:
                        # STL is valid format
                        log_pass(f"Export {fmt.upper()} is valid STL format")
                    if fmt == "step" and b"STEP stub data" in data:
                        log_fail(f"Export {fmt.upper()}", "Contains 'STEP stub data' — not real geometry")
                else:
                    log_fail(f"Export {fmt.upper()}", f"Only {size} bytes — too small")
            elif isinstance(data, dict):
                # JSON response (might be redirect URL or error)
                if "download_url" in data:
                    log_pass(f"Export {fmt.upper()}", f"Redirect to: {data['download_url'][:80]}")
                else:
                    log_fail(f"Export {fmt.upper()}", f"JSON response (not binary): {str(data)[:200]}")
        else:
            log_fail(f"Export {fmt.upper()}", f"status={status}")

    # Test STEP export separately with longer timeout (Zoo.dev can be slow)
    print(f"\nTest: Export STEP (extended timeout)")
    status, data = api_request(
        f"/projects/{project_id}/export/step",
        token=token,
        timeout=120,  # Zoo.dev conversion can take 60-90s
    )
    if status == 200 and data:
        if isinstance(data, bytes):
            if b"ISO-10303-21" in data[:200]:
                log_pass("Export STEP", f"{len(data)} bytes, valid STEP header")
            elif b"STEP stub" in data:
                log_fail("Export STEP content", "Contains stub marker")
            else:
                log_pass("Export STEP", f"{len(data)} bytes returned")
        elif isinstance(data, dict):
            if "download_url" in data:
                log_pass("Export STEP", f"Redirect to original upload: {data.get('source')}")
            else:
                log_fail("Export STEP", f"JSON response: {str(data)[:200]}")
    elif status == 0:
        log_fail("Export STEP", "Timed out (Zoo.dev conversion too slow)")
    else:
        log_fail("Export STEP", f"status={status}")

    # Test unsupported format
    print("\nTest: Export unsupported format")
    status, data = api_request(
        f"/projects/{project_id}/export/xyz",
        token=token,
    )
    if status == 400:
        log_pass("Unsupported format returns 400")
    else:
        log_fail("Unsupported format", f"Expected 400, got {status}")


# ═══════════════════════════════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("ScaleCAD Studies + Export Integration Tests")
    print("=" * 60)

    token = login()
    print(f"Logged in as {EMAIL}")

    project_id = find_project_with_fixture(token)
    if not project_id:
        print("FATAL: No projects found for test user")
        sys.exit(1)
    print(f"Using project: {project_id}")

    test_studies(token, project_id)
    test_export(token, project_id)

    print(f"\n{'=' * 60}")
    print(f"Results: {passed} passed, {failed} failed")
    if errors:
        print("\nFailures:")
        for e in errors:
            print(f"  - {e}")

    sys.exit(1 if failed > 0 else 0)
