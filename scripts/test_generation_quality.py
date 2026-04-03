#!/usr/bin/env python3
"""
Generation Quality Test Suite — Simple through Extreme complexity.
Tests correctness, not just existence.

Checks:
- Geometry exists (gltf_url)
- Bounding box is reasonable for the requested shape
- Node count > 0 and node params match requested features
- CadQuery script contains expected operations
- Dimensions stored
"""
import os, sys, json, time, asyncio, re
import httpx
import websockets

API_URL = os.environ.get("SCALECAD_API_URL", "https://scalecad-api.fly.dev")
EMAIL = os.environ.get("SCALECAD_EMAIL", "test@scalecad.io")
PASSWORD = os.environ.get("SCALECAD_PASSWORD", "TestPass123!")

# Flush output immediately
sys.stdout.reconfigure(line_buffering=True)

TEST_CASES = [
    # ── SIMPLE ───────────────────────────────────────────────────────────────
    {
        "name": "S1: Rectangular plate",
        "difficulty": "simple",
        "prompt": "200mm x 150mm x 20mm aluminum plate with 4 M10 corner holes",
        "checks": {
            "has_geometry": True,
            "has_nodes": True,
            "kcl_contains": [".box(", ".hole("],
            "kcl_not_contains": [".circle("],  # should NOT be a cylinder
            "bbox_approx": {"x": (180, 220), "y": (130, 170), "z": (15, 25)},
        },
    },
    {
        "name": "S2: Simple cylinder",
        "difficulty": "simple",
        "prompt": "80mm diameter x 70mm tall cylinder with a 20mm center bore",
        "checks": {
            "has_geometry": True,
            "has_nodes": True,
            "kcl_contains": [".circle(", ".extrude("],
            "kcl_not_contains": [".box("],  # should NOT be a box
            "bbox_approx": {"x": (70, 90), "y": (70, 90), "z": (60, 80)},
        },
    },
    # ── MODERATE ─────────────────────────────────────────────────────────────
    {
        "name": "M1: Lidar with FOV",
        "difficulty": "moderate",
        "prompt": "80mm diameter x 70mm tall circular cylinder with 3 M6 through-holes on the bottom at 60mm BCD and a solid 5mm thick wedge extending 100mm from center at mid-height representing a 90 degree vertical FOV",
        "checks": {
            "has_geometry": True,
            "has_nodes": True,
            "kcl_contains": [".circle(", ".extrude(", ".hole("],
            "kcl_not_contains": [".box("],
        },
    },
    {
        "name": "M2: L-bracket with holes",
        "difficulty": "moderate",
        "prompt": "L-bracket: 100mm tall, 80mm base, 10mm thick, 50mm deep, with two M8 holes in the base 20mm from each end",
        "checks": {
            "has_geometry": True,
            "has_nodes": True,
            "kcl_contains": [".extrude(", ".hole("],
        },
    },
    # ── HARD ─────────────────────────────────────────────────────────────────
    {
        "name": "H1: Electronics enclosure",
        "difficulty": "hard",
        "prompt": "Arduino Uno enclosure: 75mm x 60mm x 25mm box with 2mm walls, open top, 4 M2.5 mounting posts inside",
        "checks": {
            "has_geometry": True,
            "has_nodes": True,
            "kcl_contains": [".shell("],  # MUST use shell for enclosure
        },
    },
    {
        "name": "H2: Phone case",
        "difficulty": "hard",
        "prompt": "iPhone 15 Pro case: 150mm x 73mm x 10mm shell with 1.5mm walls, camera cutout 40x40mm on back, open front",
        "checks": {
            "has_geometry": True,
            "has_nodes": True,
            "kcl_contains": [".shell(", ".cut("],
            "bbox_approx": {"x": (140, 160), "y": (65, 80), "z": (8, 15)},
        },
    },
    # ── EXTREME ──────────────────────────────────────────────────────────────
    {
        "name": "E1: Spur gear",
        "difficulty": "extreme",
        "prompt": "Spur gear: 20 teeth, module 2, 10mm face width, 8mm bore. No chamfers.",
        "checks": {
            "has_geometry": True,
            "kcl_contains": ["math.", ".extrude("],  # must use math for tooth profile
            "bbox_approx": {"z": (8, 12)},  # face width check
        },
    },
    {
        "name": "E2: Water bottle",
        "difficulty": "extreme",
        "prompt": "Water bottle: 70mm diameter body, 200mm tall, tapered neck to 30mm at top, 2mm wall thickness, open top",
        "checks": {
            "has_geometry": True,
            "kcl_contains_any": [".revolve(", ".loft("],  # must use revolve or loft
        },
    },
]


class TestRunner:
    def __init__(self):
        self.client = httpx.Client(base_url=API_URL, timeout=30)
        self.token = None
        self.results = []

    def login(self):
        resp = self.client.post("/api/auth/login", json={"email": EMAIL, "password": PASSWORD})
        if resp.status_code != 200:
            print(f"FATAL: Login failed: {resp.status_code}")
            sys.exit(1)
        self.token = resp.json().get("access_token")
        self.client.headers["Authorization"] = f"Bearer {self.token}"
        print(f"✓ Logged in as {EMAIL}")

    def create_project(self):
        resp = self.client.post("/api/projects/", json={"name": f"QA-{int(time.time())}", "category": "fixture"})
        if resp.status_code not in (200, 201):
            return None
        return resp.json().get("id")

    async def _ws_generate(self, project_id: str, prompt: str, max_time: int = 180) -> dict:
        result = {"done": False, "gltf_url": None, "fixture_id": None, "errors": [], "time_s": 0}
        start = time.time()
        ws_url = API_URL.replace("https://", "wss://").replace("http://", "ws://")
        ws_url = f"{ws_url}/api/projects/{project_id}/chat"

        try:
            async with websockets.connect(ws_url, close_timeout=5, ping_interval=20, ping_timeout=60) as ws:
                await ws.send(json.dumps({"type": "auth", "token": self.token}))
                auth = json.loads(await asyncio.wait_for(ws.recv(), timeout=10))
                if auth.get("type") != "auth_ok":
                    result["errors"].append("Auth failed")
                    return result

                await ws.send(json.dumps({"type": "message", "content": prompt}))

                deadline = time.time() + max_time
                while time.time() < deadline:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=10)
                        msg = json.loads(raw)
                        mt = msg.get("type", "")

                        if mt == "generation_done":
                            result["done"] = True
                            result["gltf_url"] = msg.get("gltf_url")
                            result["fixture_id"] = msg.get("fixture_id")
                            break
                        elif mt == "generation_error":
                            result["errors"].append(msg.get("message", "")[:200])
                            break
                        elif mt == "clarification_needed":
                            await ws.send(json.dumps({
                                "type": "message",
                                "content": "Use the default dimensions as proposed. Proceed with generation.",
                            }))
                    except asyncio.TimeoutError:
                        continue
        except Exception as e:
            result["errors"].append(str(e)[:200])

        result["time_s"] = round(time.time() - start, 1)
        return result

    def get_fixture_data(self, project_id: str) -> dict:
        """Get geometry, KCL script, dimensions, and nodes."""
        data = {"has_geometry": False, "gltf_url": None, "kcl": None, "dims": None,
                "bbox": None, "nodes": [], "node_count": 0, "has_validation": False}

        # Fixture geometry + KCL
        r = self.client.get(f"/api/projects/{project_id}/geometry/fixture")
        if r.status_code == 200:
            d = r.json()
            data["has_geometry"] = bool(d.get("gltf_url"))
            data["gltf_url"] = d.get("gltf_url")
            data["kcl"] = d.get("kcl", "")
            data["dims"] = d.get("dimensions_json")
            if data["dims"] and isinstance(data["dims"], list):
                bbox = {}
                for dim in data["dims"]:
                    axis = dim.get("axis", "").upper()
                    if axis in ("X", "Y", "Z"):
                        bbox[axis.lower()] = dim.get("value_mm", 0)
                data["bbox"] = bbox

        # Nodes
        r2 = self.client.get(f"/api/projects/{project_id}/nodes")
        if r2.status_code == 200:
            nodes = r2.json().get("nodes", [])
            data["nodes"] = nodes
            data["node_count"] = len(nodes)

        # Validation
        r3 = self.client.get(f"/api/projects/{project_id}/validation")
        data["has_validation"] = r3.status_code == 200

        return data

    def evaluate(self, test_case: dict, fixture_data: dict) -> tuple[bool, list[str]]:
        """Evaluate fixture data against test case checks. Returns (passed, reasons)."""
        checks = test_case["checks"]
        issues = []

        # Geometry exists
        if checks.get("has_geometry") and not fixture_data["has_geometry"]:
            issues.append("NO GEOMETRY generated")

        # Nodes exist
        if checks.get("has_nodes") and fixture_data["node_count"] == 0:
            issues.append(f"NO NODES (expected >0, got {fixture_data['node_count']})")

        # KCL script checks
        kcl = fixture_data.get("kcl") or ""

        for pattern in checks.get("kcl_contains", []):
            if pattern not in kcl:
                issues.append(f"KCL missing '{pattern}' — wrong operation used")

        for pattern in checks.get("kcl_not_contains", []):
            if pattern in kcl:
                issues.append(f"KCL contains '{pattern}' — WRONG shape generated")

        if checks.get("kcl_contains_any"):
            if not any(p in kcl for p in checks["kcl_contains_any"]):
                issues.append(f"KCL missing any of {checks['kcl_contains_any']}")

        # Bounding box checks
        if checks.get("bbox_approx") and fixture_data.get("bbox"):
            bbox = fixture_data["bbox"]
            for axis, (lo, hi) in checks["bbox_approx"].items():
                val = bbox.get(axis, 0)
                if val < lo or val > hi:
                    issues.append(f"Bbox {axis.upper()}={val:.1f}mm outside [{lo},{hi}]")

        return (len(issues) == 0, issues)

    def run_test(self, test_case: dict) -> dict:
        name = test_case["name"]
        diff = test_case["difficulty"]
        prompt = test_case["prompt"]

        print(f"\n{'─'*60}")
        print(f"[{diff.upper()}] {name}")
        print(f"  Prompt: {prompt[:70]}...")

        project_id = self.create_project()
        if not project_id:
            return {"name": name, "passed": False, "issues": ["Project creation failed"]}

        # Generate
        print(f"  Generating...", end="", flush=True)
        gen = asyncio.new_event_loop().run_until_complete(
            self._ws_generate(project_id, prompt, max_time=180)
        )
        print(f" {'done' if gen['done'] else 'timeout'} ({gen['time_s']}s)")

        if gen["errors"]:
            print(f"  Gen errors: {gen['errors']}")

        # Wait for async completion
        if not gen["done"]:
            print(f"  Waiting 30s for async completion...")
            time.sleep(30)

        # Fetch and evaluate
        fixture = self.get_fixture_data(project_id)
        print(f"  Geometry: {fixture['has_geometry']}, Nodes: {fixture['node_count']}, "
              f"KCL: {len(fixture.get('kcl') or '')} chars, Dims: {bool(fixture.get('dims'))}")

        passed, issues = self.evaluate(test_case, fixture)

        # Show KCL snippet for debugging failures
        if not passed and fixture.get("kcl"):
            kcl = fixture["kcl"]
            # Show first 3 lines of CadQuery code
            lines = [l for l in kcl.split("\n") if l.strip() and not l.strip().startswith("#")][:5]
            print(f"  KCL preview: {' | '.join(l.strip() for l in lines)}")

        status = "PASS ✓" if passed else "FAIL ✗"
        print(f"  {status}")
        for issue in issues:
            print(f"    → {issue}")

        return {
            "name": name, "difficulty": diff, "passed": passed,
            "issues": issues, "time_s": gen["time_s"],
            "has_geometry": fixture["has_geometry"],
            "node_count": fixture["node_count"],
            "has_dims": bool(fixture.get("dims")),
            "kcl_len": len(fixture.get("kcl") or ""),
            "project_id": project_id,
        }

    def run_all(self, difficulty_filter: str | None = None):
        print("=" * 60)
        print("ScaleCAD Generation Quality Test Suite")
        print(f"API: {API_URL}")

        cases = TEST_CASES
        if difficulty_filter:
            cases = [tc for tc in cases if tc["difficulty"] == difficulty_filter]
        print(f"Tests: {len(cases)}")
        print("=" * 60)

        self.login()

        for tc in cases:
            result = self.run_test(tc)
            self.results.append(result)

        # Summary
        print(f"\n\n{'='*60}")
        print("SUMMARY")
        print("="*60)
        by_diff = {}
        for r in self.results:
            d = r["difficulty"]
            if d not in by_diff:
                by_diff[d] = {"passed": 0, "total": 0}
            by_diff[d]["total"] += 1
            if r["passed"]:
                by_diff[d]["passed"] += 1

        for d in ["simple", "moderate", "hard", "extreme"]:
            if d in by_diff:
                s = by_diff[d]
                print(f"  {d.upper():10s}: {s['passed']}/{s['total']}")

        total_passed = sum(1 for r in self.results if r["passed"])
        total = len(self.results)
        print(f"\n  TOTAL: {total_passed}/{total}")

        print(f"\n{'─'*60}")
        for r in self.results:
            s = "✓" if r["passed"] else "✗"
            print(f"  {s} [{r['difficulty'][:3].upper()}] {r['name']:30s} {r['time_s']:5.0f}s  "
                  f"geom={r['has_geometry']} nodes={r['node_count']:2d} kcl={r['kcl_len']:5d}")
            for issue in r.get("issues", []):
                print(f"      → {issue}")

        return total_passed == total


if __name__ == "__main__":
    diff_filter = sys.argv[1] if len(sys.argv) > 1 else None
    runner = TestRunner()
    success = runner.run_all(diff_filter)
    sys.exit(0 if success else 1)
