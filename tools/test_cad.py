#!/usr/bin/env python3
"""
ScaleCAD Text-to-CAD fidelity tester.

Tests the Zoo.dev proxy and full backend pipeline.
Downloads GLB (and optionally STEP) outputs to ./cad_outputs/.

Usage:
  python tools/test_cad.py                         # interactive prompt
  python tools/test_cad.py "drill jig M8 bolts"   # direct prompt
  python tools/test_cad.py --via-backend           # route through Fly.io backend
  python tools/test_cad.py --backend-url https://scalecad-api.fly.dev

Requirements: pip install httpx
"""
import argparse
import base64
import json
import os
import sys
import time
from pathlib import Path

try:
    import httpx
except ImportError:
    print("ERROR: pip install httpx")
    sys.exit(1)

# ── Config ─────────────────────────────────────────────────────────────────────
PROXY_URL = "https://eager-euler.vercel.app/api/zoo-proxy"
PROXY_KEY = "scalecad-zoo-proxy-2024"
ZOO_API_KEY = os.environ.get("ZOO_API_KEY", "api-0ca850cd-0e1f-4208-b265-f167ab77dd95")
BACKEND_URL = os.environ.get("SCALECAD_BACKEND", "https://scalecad-api.fly.dev")
BACKEND_EMAIL = os.environ.get("SCALECAD_EMAIL", "test@scalecad.io")
BACKEND_PASSWORD = os.environ.get("SCALECAD_PASSWORD", "TestPass123!")
POLL_INTERVAL = 6
POLL_MAX = 25  # 150s max
OUT_DIR = Path("cad_outputs")


def safe_b64decode(s: str) -> bytes | None:
    try:
        return base64.b64decode(s + "=" * (-len(s) % 4))
    except Exception as e:
        print(f"  [!] base64 decode error: {e}")
        return None


# ── Direct proxy test ──────────────────────────────────────────────────────────

def test_via_proxy(prompt: str, download: bool = True) -> dict:
    """Submit text-to-CAD job through Vercel proxy, poll, download GLB."""
    print(f"\n{'='*60}")
    print(f"  Mode: Vercel Proxy → Zoo.dev")
    print(f"  Prompt: {prompt}")
    print(f"{'='*60}")

    headers = {
        "x-proxy-key": PROXY_KEY,
        "Authorization": f"Bearer {ZOO_API_KEY}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=30) as client:
        # Submit job
        print("\n[1/4] Submitting text-to-CAD job...")
        r = client.post(
            f"{PROXY_URL}?zoo_path=/ai/text-to-cad/glb&kcl=true",
            headers=headers,
            json={"prompt": prompt},
        )
        if r.status_code not in (200, 201):
            print(f"  [FAIL] HTTP {r.status_code}: {r.text[:200]}")
            return {"success": False, "error": r.text}

        job = r.json()
        op_id = job.get("id")
        print(f"  [OK] Job queued: {op_id}")
        print(f"       Status: {job.get('status')}")

        # Poll
        print(f"\n[2/4] Polling for completion (max {POLL_MAX * POLL_INTERVAL}s)...")
        data = None
        for i in range(POLL_MAX):
            time.sleep(POLL_INTERVAL)
            try:
                pr = client.get(
                    f"{PROXY_URL}?zoo_path=/user/text-to-cad/{op_id}",
                    headers=headers,
                )
                pr.raise_for_status()
                data = pr.json()
                status = data.get("status", "").lower()
                elapsed = (i + 1) * POLL_INTERVAL
                print(f"  [{elapsed:3d}s] status={status}")
                if status == "completed":
                    break
                if status in ("failed", "error"):
                    print(f"  [FAIL] Job failed: {data.get('error')}")
                    return {"success": False, "error": data.get("error")}
            except Exception as e:
                print(f"  [WARN] Poll error: {e}")

        if not data or data.get("status", "").lower() != "completed":
            print("  [FAIL] Timed out waiting for completion")
            return {"success": False, "error": "timeout"}

        # Extract outputs
        print(f"\n[3/4] Extracting outputs...")
        outputs = data.get("outputs") or {}
        glb_b64 = outputs.get("source.glb")
        kcl_code = data.get("code", "")

        print(f"  KCL code: {len(kcl_code)} chars")
        print(f"  GLB data: {'YES' if glb_b64 else 'NO'}")
        print(f"  Output keys: {list(outputs.keys())}")

        if kcl_code:
            print("\n  --- KCL Preview (first 500 chars) ---")
            print(kcl_code[:500])
            print("  ---")

        if not download or not glb_b64:
            return {"success": bool(glb_b64), "job_id": op_id, "kcl": kcl_code}

        # Download
        print(f"\n[4/4] Saving outputs to {OUT_DIR}/...")
        OUT_DIR.mkdir(exist_ok=True)
        slug = prompt[:30].replace(" ", "_").replace("/", "-")
        ts = int(time.time())

        glb_bytes = safe_b64decode(glb_b64)
        if glb_bytes:
            glb_path = OUT_DIR / f"{slug}_{ts}.glb"
            glb_path.write_bytes(glb_bytes)
            print(f"  [OK] GLB saved: {glb_path} ({len(glb_bytes):,} bytes)")
        else:
            print("  [FAIL] Could not decode GLB")

        if kcl_code:
            kcl_path = OUT_DIR / f"{slug}_{ts}.kcl"
            kcl_path.write_text(kcl_code)
            print(f"  [OK] KCL saved: {kcl_path}")

        return {
            "success": bool(glb_bytes),
            "job_id": op_id,
            "glb_path": str(glb_path) if glb_bytes else None,
            "glb_size": len(glb_bytes) if glb_bytes else 0,
            "kcl_lines": kcl_code.count("\n"),
        }


# ── Backend pipeline test ──────────────────────────────────────────────────────

def test_via_backend(prompt: str) -> dict:
    """Route through the full ScaleCAD backend: init project → poll gltf_url."""
    print(f"\n{'='*60}")
    print(f"  Mode: Full Backend Pipeline (Fly.io → Vercel proxy → Zoo.dev)")
    print(f"  Prompt: {prompt}")
    print(f"{'='*60}")

    with httpx.Client(timeout=30, base_url=BACKEND_URL) as client:
        # Login
        print("\n[1/5] Authenticating...")
        lr = client.post("/api/auth/login", json={
            "email": BACKEND_EMAIL,
            "password": BACKEND_PASSWORD,
        })
        if lr.status_code != 200:
            print(f"  [FAIL] Login HTTP {lr.status_code}: {lr.text[:200]}")
            return {"success": False, "error": "auth failed"}
        token = lr.json()["access_token"]
        auth = {"Authorization": f"Bearer {token}"}
        print(f"  [OK] Logged in as {BACKEND_EMAIL}")

        # Create project
        print("\n[2/5] Creating project...")
        pr = client.post("/api/projects/", headers=auth, json={
            "name": f"CAD Test: {prompt[:40]}",
            "description": prompt,
        })
        if pr.status_code not in (200, 201):
            print(f"  [FAIL] Create project HTTP {pr.status_code}: {pr.text[:200]}")
            return {"success": False, "error": "project create failed"}
        project_id = pr.json()["id"]
        print(f"  [OK] Project: {project_id}")

        # Init (triggers Zoo.dev job via proxy)
        print("\n[3/5] Triggering fixture generation (init)...")
        ir = client.post(f"/api/projects/{project_id}/init", headers=auth, json={
            "prompt": prompt,
        })
        print(f"  Response: {ir.status_code} — {ir.text[:200]}")

        # Poll geometry
        print(f"\n[4/5] Polling for gltf_url (max {POLL_MAX * POLL_INTERVAL}s)...")
        gltf_url = None
        for i in range(POLL_MAX):
            time.sleep(POLL_INTERVAL)
            gr = client.get(f"/api/projects/{project_id}/geometry/fixture", headers=auth)
            if gr.status_code == 200:
                d = gr.json()
                gltf_url = (d.get("gltf_url") or
                            (d.get("data") or {}).get("gltf_url") or
                            d.get("fixture", {}).get("gltf_url"))
                elapsed = (i + 1) * POLL_INTERVAL
                print(f"  [{elapsed:3d}s] gltf_url={gltf_url or '(waiting)'}")
                if gltf_url:
                    break

        if not gltf_url:
            print("  [FAIL] No gltf_url after polling")
            return {"success": False, "error": "no gltf_url", "project_id": project_id}

        # Verify GLB
        print(f"\n[5/5] Verifying GLB at {gltf_url[:80]}...")
        gr = httpx.get(gltf_url, timeout=30, follow_redirects=True)
        ct = gr.headers.get("content-type", "")
        size = len(gr.content)
        is_glb = gr.content[:4] == b"glTF" or "gltf" in ct or "octet" in ct
        print(f"  Content-Type: {ct}")
        print(f"  Size: {size:,} bytes")
        print(f"  Valid GLB magic: {'YES' if is_glb else 'NO (might be stub)'}")

        # Save
        if size > 100:
            OUT_DIR.mkdir(exist_ok=True)
            slug = prompt[:30].replace(" ", "_")
            ts = int(time.time())
            glb_path = OUT_DIR / f"backend_{slug}_{ts}.glb"
            glb_path.write_bytes(gr.content)
            print(f"  [OK] Saved: {glb_path}")

        return {
            "success": True,
            "project_id": project_id,
            "gltf_url": gltf_url,
            "glb_size": size,
            "is_real_glb": is_glb,
        }


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="ScaleCAD Text-to-CAD tester")
    parser.add_argument("prompt", nargs="?", help="CAD prompt (interactive if omitted)")
    parser.add_argument("--via-backend", action="store_true", help="Route through Fly.io backend")
    parser.add_argument("--no-download", action="store_true", help="Skip file download")
    args = parser.parse_args()

    prompt = args.prompt
    if not prompt:
        print("ScaleCAD Text-to-CAD Fidelity Tester")
        print("Outputs saved to ./cad_outputs/\n")
        prompt = input("Enter CAD prompt: ").strip()
        if not prompt:
            prompt = "simple drill jig aluminum plate 200x150x20mm with 4 M8 clamp holes"
            print(f"Using default: {prompt}")

    if args.via_backend:
        result = test_via_backend(prompt)
    else:
        result = test_via_proxy(prompt, download=not args.no_download)

    print(f"\n{'='*60}")
    print(f"  RESULT: {'SUCCESS ✓' if result.get('success') else 'FAILED ✗'}")
    for k, v in result.items():
        if k != "success":
            print(f"  {k}: {v}")
    print(f"{'='*60}\n")
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
