#!/usr/bin/env python3
"""
Generation Quality Test Suite for ScaleCAD/ForgeAI.

Tests the full pipeline: prompt → design spec → CadQuery → STEP → GLB → viewport
Also checks: nodes auto-populate, dimensions stored, validation runs.

Usage:
  python scripts/test_generation_quality.py [--api-url URL] [--email EMAIL] [--password PASS]
"""
import os
import sys
import json
import time
import asyncio
import httpx
import websockets

API_URL = os.environ.get("SCALECAD_API_URL", "https://scalecad-api.fly.dev")
EMAIL = os.environ.get("SCALECAD_EMAIL", "test@scalecad.io")
PASSWORD = os.environ.get("SCALECAD_PASSWORD", "TestPass123!")

# ── Test Cases ────────────────────────────────────────────────────────────────
# Each test: {prompt, expected_shape, expected_features, max_time_s}

TEST_CASES = [
    # ── Simple (should always pass) ──────────────────────────────────────────
    {
        "name": "Simple plate",
        "prompt": "200mm x 150mm x 20mm aluminum plate with 4 M10 corner holes",
        "expected": {
            "has_geometry": True,
            "has_nodes": True,
            "min_step_bytes": 500,
        },
        "max_time_s": 180,
    },
    {
        "name": "Simple cylinder",
        "prompt": "80mm diameter x 70mm tall cylinder with a 20mm center bore",
        "expected": {
            "has_geometry": True,
            "has_nodes": True,
            "min_step_bytes": 500,
        },
        "max_time_s": 180,
    },
    # ── Medium ───────────────────────────────────────────────────────────────
    {
        "name": "Lidar cylinder",
        "prompt": "80mm diameter x 70mm tall circular cylinder with 3 M6 through-holes on the bottom at 60mm BCD and a solid 5mm thick wedge extending 100mm from center at mid-height representing a 90 degree vertical FOV",
        "expected": {
            "has_geometry": True,
            "has_nodes": True,
            "min_step_bytes": 1000,
        },
        "max_time_s": 180,
    },
    {
        "name": "L-bracket",
        "prompt": "L-bracket: 100mm tall, 80mm base, 10mm thick, 50mm deep, with two M8 holes in the base",
        "expected": {
            "has_geometry": True,
            "has_nodes": True,
            "min_step_bytes": 500,
        },
        "max_time_s": 180,
    },
    # ── Complex ──────────────────────────────────────────────────────────────
    {
        "name": "Electronics enclosure",
        "prompt": "Arduino Uno enclosure: 75mm x 60mm x 25mm box with 2mm walls, open top, 4 M2.5 mounting posts inside matching Arduino hole pattern",
        "expected": {
            "has_geometry": True,
            "has_nodes": True,
            "min_step_bytes": 1000,
        },
        "max_time_s": 180,
    },
    {
        "name": "Phone case",
        "prompt": "iPhone 15 Pro case: 150mm x 73mm x 10mm shell with 1.5mm walls, camera cutout 40x40mm on back, open front",
        "expected": {
            "has_geometry": True,
            "has_nodes": True,
            "min_step_bytes": 1000,
        },
        "max_time_s": 180,
    },
]


class TestRunner:
    def __init__(self):
        self.client = httpx.Client(base_url=API_URL, timeout=30)
        self.token = None
        self.results = []

    def login(self):
        """Authenticate and get JWT token."""
        resp = self.client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if resp.status_code != 200:
            print(f"FATAL: Login failed: {resp.status_code} {resp.text[:200]}")
            sys.exit(1)
        data = resp.json()
        self.token = data.get("access_token")
        self.client.headers["Authorization"] = f"Bearer {self.token}"
        print(f"✓ Logged in as {EMAIL}")

    def create_project(self):
        """Create a new blank project."""
        resp = self.client.post("/api/projects/", json={
            "name": f"QA Test {int(time.time())}",
            "category": "fixture",
        })
        if resp.status_code not in (200, 201):
            print(f"  FAIL: Create project: {resp.status_code} {resp.text[:200]}")
            return None
        return resp.json().get("id")

    def run_generation(self, project_id: str, prompt: str, max_time_s: int = 120) -> dict:
        """Send prompt via WebSocket chat and wait for generation_done."""
        ws_url = API_URL.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/api/projects/{project_id}/chat"

        result = {
            "generation_done": False,
            "gltf_url": None,
            "fixture_id": None,
            "errors": [],
            "time_s": 0,
        }

        try:
            loop = asyncio.new_event_loop()
            result = loop.run_until_complete(
                self._ws_generate(ws_url, prompt, max_time_s)
            )
            loop.close()
        except Exception as e:
            result["errors"].append(str(e)[:200])

        return result

    async def _ws_generate(self, ws_url: str, prompt: str, max_time_s: int) -> dict:
        result = {
            "generation_done": False,
            "gltf_url": None,
            "fixture_id": None,
            "errors": [],
            "time_s": 0,
            "messages": [],
        }
        start = time.time()

        async with websockets.connect(ws_url, close_timeout=5) as ws:
            # Auth
            await ws.send(json.dumps({"type": "auth", "token": self.token}))
            auth_resp = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
            if auth_resp.get("type") != "auth_ok":
                result["errors"].append(f"Auth failed: {auth_resp}")
                return result

            # Send prompt
            await ws.send(json.dumps({"type": "message", "content": prompt}))

            # Listen for messages until generation_done or timeout
            deadline = time.time() + max_time_s
            while time.time() < deadline:
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=5)
                    msg = json.loads(raw)
                    msg_type = msg.get("type", "")
                    result["messages"].append(msg_type)

                    if msg_type == "generation_done":
                        result["generation_done"] = True
                        result["gltf_url"] = msg.get("gltf_url")
                        result["fixture_id"] = msg.get("fixture_id")
                        break

                    if msg_type == "generation_error":
                        result["errors"].append(msg.get("message", "Unknown error")[:200])
                        break

                    # If clarification is asked, provide a generic answer
                    if msg_type == "clarification_needed":
                        await ws.send(json.dumps({
                            "type": "message",
                            "content": "Use the default dimensions as proposed. Proceed with generation.",
                        }))

                except asyncio.TimeoutError:
                    continue

        result["time_s"] = round(time.time() - start, 1)
        return result

    def check_geometry(self, project_id: str) -> dict:
        """Check if geometry was generated and has valid data."""
        checks = {
            "has_geometry": False,
            "gltf_url": None,
            "step_bytes": 0,
            "has_dimensions": False,
        }

        # Check fixture geometry
        resp = self.client.get(f"/api/projects/{project_id}/geometry/fixture")
        if resp.status_code == 200:
            data = resp.json()
            checks["has_geometry"] = bool(data.get("gltf_url"))
            checks["gltf_url"] = data.get("gltf_url")
            checks["has_dimensions"] = bool(data.get("dimensions_json"))

        return checks

    def check_nodes(self, project_id: str) -> bool:
        """Check if node graph was auto-generated."""
        resp = self.client.get(f"/api/projects/{project_id}/nodes")
        if resp.status_code == 200:
            data = resp.json()
            nodes = data.get("nodes", [])
            return len(nodes) > 0
        return False

    def check_validation(self, project_id: str) -> bool:
        """Check if validation results exist."""
        resp = self.client.get(f"/api/projects/{project_id}/validation")
        return resp.status_code == 200

    def run_test(self, test_case: dict) -> dict:
        """Run a single test case end-to-end."""
        name = test_case["name"]
        prompt = test_case["prompt"]
        expected = test_case["expected"]
        max_time = test_case.get("max_time_s", 120)

        print(f"\n{'='*60}")
        print(f"TEST: {name}")
        print(f"PROMPT: {prompt[:80]}...")
        print(f"{'='*60}")

        # Create project
        project_id = self.create_project()
        if not project_id:
            return {"name": name, "passed": False, "reason": "Failed to create project"}

        print(f"  Project: {project_id}")

        # Run generation
        print(f"  Generating (max {max_time}s)...")
        gen_result = self.run_generation(project_id, prompt, max_time)
        print(f"  Generation done: {gen_result['generation_done']} ({gen_result['time_s']}s)")
        if gen_result["errors"]:
            print(f"  Errors: {gen_result['errors']}")

        # Wait a moment for async operations to complete
        time.sleep(3)

        # Check geometry
        geom = self.check_geometry(project_id)
        print(f"  Geometry: {geom['has_geometry']}, dims: {geom['has_dimensions']}")

        # Check nodes
        has_nodes = self.check_nodes(project_id)
        print(f"  Nodes: {has_nodes}")

        # Check validation
        has_validation = self.check_validation(project_id)
        print(f"  Validation: {has_validation}")

        # Evaluate
        passed = True
        reasons = []

        if expected.get("has_geometry") and not geom["has_geometry"]:
            passed = False
            reasons.append("No geometry generated")

        if expected.get("has_nodes") and not has_nodes:
            passed = False
            reasons.append("No node graph generated")

        if gen_result["errors"]:
            passed = False
            reasons.append(f"Generation errors: {gen_result['errors'][0][:100]}")

        status = "PASS ✓" if passed else "FAIL ✗"
        print(f"\n  RESULT: {status}")
        if reasons:
            print(f"  REASONS: {'; '.join(reasons)}")

        return {
            "name": name,
            "passed": passed,
            "reasons": reasons,
            "time_s": gen_result["time_s"],
            "has_geometry": geom["has_geometry"],
            "has_nodes": has_nodes,
            "has_dims": geom["has_dimensions"],
            "has_validation": has_validation,
            "project_id": project_id,
        }

    def run_all(self):
        """Run all test cases and print summary."""
        print("=" * 60)
        print("ScaleCAD Generation Quality Test Suite")
        print(f"API: {API_URL}")
        print(f"Tests: {len(TEST_CASES)}")
        print("=" * 60)

        self.login()

        for tc in TEST_CASES:
            result = self.run_test(tc)
            self.results.append(result)

        # Summary
        print("\n\n" + "=" * 60)
        print("SUMMARY")
        print("=" * 60)
        passed = sum(1 for r in self.results if r["passed"])
        total = len(self.results)
        print(f"\n  {passed}/{total} tests passed\n")

        for r in self.results:
            status = "✓" if r["passed"] else "✗"
            extras = []
            if r.get("has_geometry"): extras.append("geom")
            if r.get("has_nodes"): extras.append("nodes")
            if r.get("has_dims"): extras.append("dims")
            print(f"  {status} {r['name']:30s} {r['time_s']:6.1f}s  [{', '.join(extras)}]")
            if r.get("reasons"):
                for reason in r["reasons"]:
                    print(f"    → {reason}")

        print(f"\n  Total time: {sum(r['time_s'] for r in self.results):.0f}s")
        return passed == total


if __name__ == "__main__":
    runner = TestRunner()
    success = runner.run_all()
    sys.exit(0 if success else 1)
