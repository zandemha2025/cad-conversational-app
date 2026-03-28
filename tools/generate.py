#!/usr/bin/env python3
"""
ScaleCAD — Generate a CAD model from a text prompt.

Fill in the template, run it, get a .glb on your Desktop.

Usage:
  python tools/generate.py                        # interactive — walks you through it
  python tools/generate.py "drill jig 200x150mm"  # one-shot prompt
  python tools/generate.py --output ./my_part.glb  # custom output path

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
    print("Run: pip install httpx")
    sys.exit(1)

# ── Config ────────────────────────────────────────────────────────────────────
PROXY_URL = "https://eager-euler.vercel.app/api/zoo-proxy"
PROXY_KEY = "scalecad-zoo-proxy-2024"
ZOO_API_KEY = os.environ.get("ZOO_API_KEY", "api-0ca850cd-0e1f-4208-b265-f167ab77dd95")
POLL_INTERVAL = 5
POLL_MAX = 40  # 200s max
DESKTOP = Path.home() / "Desktop"


# ── Prompt templates ──────────────────────────────────────────────────────────

TEMPLATES = {
    "fixture": (
        "{type} made of {material}. "
        "Overall dimensions: {length}mm x {width}mm x {height}mm. "
        "{features}. "
        "{mounting}. "
        "Designed for CNC workholding with precise mechanical tolerances."
    ),
    "bracket": (
        "L-bracket made of {material}. "
        "Overall dimensions: {length}mm x {width}mm x {height}mm, wall thickness {thickness}mm. "
        "{features}. "
        "{mounting}."
    ),
    "plate": (
        "Flat mounting plate made of {material}. "
        "{length}mm x {width}mm x {height}mm. "
        "{features}. "
        "{mounting}."
    ),
    "custom": "{prompt}",
}

DEFAULTS = {
    "type": "drill jig base plate",
    "material": "6061-T6 aluminum",
    "length": "200",
    "width": "150",
    "height": "20",
    "thickness": "10",
    "features": "4x M8 through-holes on 160x110mm bolt pattern, 2x dowel pin holes 6mm H7",
    "mounting": "Counterbored mounting holes for M6 socket head cap screws",
}


def interactive_prompt() -> str:
    """Walk the user through filling in a prompt template."""
    print("\n--- ScaleCAD Prompt Builder ---\n")
    print("Templates:")
    print("  1. Fixture / Jig  (drill jig, clamp plate, work holder)")
    print("  2. Bracket        (L-bracket, angle bracket)")
    print("  3. Plate          (mounting plate, adapter plate)")
    print("  4. Custom         (type your own prompt)")

    choice = input("\nPick a template [1]: ").strip() or "1"
    tpl_map = {"1": "fixture", "2": "bracket", "3": "plate", "4": "custom"}
    tpl_name = tpl_map.get(choice, "fixture")

    if tpl_name == "custom":
        prompt = input("\nYour prompt: ").strip()
        if not prompt:
            prompt = "simple drill jig aluminum plate 200x150x20mm with 4 M8 clamp holes"
        return prompt

    template = TEMPLATES[tpl_name]
    print(f"\nFill in the blanks (press Enter for default):\n")

    values = {}
    # Figure out which fields this template needs
    import re
    fields = re.findall(r"\{(\w+)\}", template)

    for field in fields:
        default = DEFAULTS.get(field, "")
        label = field.replace("_", " ").title()
        val = input(f"  {label} [{default}]: ").strip()
        values[field] = val or default

    prompt = template.format(**values)
    print(f"\n  Final prompt: {prompt}")
    confirm = input("  Good? [Y/n]: ").strip().lower()
    if confirm == "n":
        prompt = input("  Edit prompt: ").strip() or prompt

    return prompt


# ── Generation ────────────────────────────────────────────────────────────────

def generate(prompt: str, output_path: Path) -> bool:
    """Submit to Zoo.dev, poll, download GLB."""
    headers = {
        "x-proxy-key": PROXY_KEY,
        "Authorization": f"Bearer {ZOO_API_KEY}",
        "Content-Type": "application/json",
    }

    with httpx.Client(timeout=30) as client:
        # Submit
        print(f"\n[1/3] Submitting to Zoo.dev...")
        print(f"      Prompt: {prompt[:80]}{'...' if len(prompt) > 80 else ''}")
        r = client.post(
            f"{PROXY_URL}?zoo_path=/ai/text-to-cad/glb&kcl=true",
            headers=headers,
            json={"prompt": prompt},
        )
        if r.status_code not in (200, 201):
            print(f"  FAILED: HTTP {r.status_code} — {r.text[:200]}")
            return False

        job = r.json()
        op_id = job.get("id")
        print(f"      Job ID: {op_id}")

        # Poll
        print(f"\n[2/3] Generating (up to ~3 min)...", end="", flush=True)
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
                print(".", end="", flush=True)
                if status == "completed":
                    print(" done!")
                    break
                if status in ("failed", "error"):
                    print(f" FAILED: {data.get('error')}")
                    return False
            except Exception as e:
                print("x", end="", flush=True)

        if not data or data.get("status", "").lower() != "completed":
            print(" timed out.")
            return False

        # Extract + save
        print(f"\n[3/3] Saving to {output_path}")
        outputs = data.get("outputs") or {}
        kcl_code = data.get("code", "")

        # Try GLB first, then GLTF→GLB conversion
        glb_b64 = outputs.get("source.glb")
        glb_bytes = None
        if glb_b64:
            glb_bytes = base64.b64decode(glb_b64 + "=" * (-len(glb_b64) % 4))

        if not glb_bytes:
            gltf_b64 = outputs.get("source.gltf")
            if gltf_b64:
                gltf_bytes = base64.b64decode(gltf_b64 + "=" * (-len(gltf_b64) % 4))
                # Convert GLTF JSON to GLB binary
                try:
                    gltf = json.loads(gltf_bytes)
                    import struct
                    bin_parts = []
                    for buf in gltf.get("buffers", []):
                        uri = buf.pop("uri", "")
                        if uri.startswith("data:"):
                            raw = base64.b64decode(uri.split(",", 1)[1])
                        else:
                            raw = b""
                        buf["byteLength"] = len(raw)
                        bin_parts.append(raw)
                    bin_data = b"".join(bin_parts)
                    bin_pad = b"\x00" * ((-len(bin_data)) % 4)
                    json_raw = json.dumps(gltf, separators=(",", ":")).encode()
                    json_pad = b" " * ((-len(json_raw)) % 4)
                    json_chunk = json_raw + json_pad
                    bin_chunk = bin_data + bin_pad
                    total = 12 + 8 + len(json_chunk) + (8 + len(bin_chunk) if bin_chunk else 0)
                    glb_bytes = struct.pack("<III", 0x46546C67, 2, total)
                    glb_bytes += struct.pack("<II", len(json_chunk), 0x4E4F534A) + json_chunk
                    if bin_chunk:
                        glb_bytes += struct.pack("<II", len(bin_chunk), 0x004E4942) + bin_chunk
                except Exception as e:
                    print(f"  GLTF→GLB conversion failed: {e}")

        if not glb_bytes:
            print(f"  No GLB produced. Available outputs: {list(outputs.keys())}")
            return False

        # Write files
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_bytes(glb_bytes)
        size_kb = len(glb_bytes) / 1024
        print(f"      GLB: {output_path} ({size_kb:.1f} KB)")

        if kcl_code:
            kcl_path = output_path.with_suffix(".kcl")
            kcl_path.write_text(kcl_code)
            print(f"      KCL: {kcl_path} ({kcl_code.count(chr(10))} lines)")

        # Save prompt for reference
        meta_path = output_path.with_suffix(".txt")
        meta_path.write_text(f"Prompt: {prompt}\nJob: {op_id}\nGenerated: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        print(f"      Meta: {meta_path}")

        return True


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate a CAD model from a text prompt")
    parser.add_argument("prompt", nargs="?", help="CAD prompt (interactive if omitted)")
    parser.add_argument("-o", "--output", help="Output .glb path (default: ~/Desktop/<name>.glb)")
    parser.add_argument("-n", "--name", help="Output filename (without extension)")
    args = parser.parse_args()

    # Get prompt
    prompt = args.prompt
    if not prompt:
        prompt = interactive_prompt()

    # Determine output path
    if args.output:
        output = Path(args.output)
    else:
        name = args.name or prompt[:40].replace(" ", "_").replace("/", "-")
        output = DESKTOP / f"{name}.glb"

    # Generate
    ok = generate(prompt, output)

    if ok:
        print(f"\nDone! Open {output} in any 3D viewer.")
    else:
        print("\nGeneration failed. Try a simpler prompt or check your connection.")

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
