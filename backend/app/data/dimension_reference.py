"""
Real-world dimension reference for common objects, devices, and fasteners.
Used by Gemini to inject accurate dimensions when users reference real-world items.
"""

DIMENSION_REFERENCE = [
    # ── Phones ────────────────────────────────────────────────────────────────
    {
        "id": "iphone_15_pro",
        "name": "iPhone 15 Pro",
        "keywords": ["iphone 15 pro", "iphone15pro", "iphone 15"],
        "dimensions": {"width_mm": 71.5, "height_mm": 146.7, "depth_mm": 8.25},
        "notes": "Camera bump 4.18mm above back. USB-C port centered at bottom. Dynamic Island at top.",
    },
    {
        "id": "iphone_16_pro",
        "name": "iPhone 16 Pro",
        "keywords": ["iphone 16 pro", "iphone16pro", "iphone 16"],
        "dimensions": {"width_mm": 71.5, "height_mm": 149.6, "depth_mm": 8.25},
        "notes": "Camera bump 4.18mm. USB-C port centered. Camera Control button right side.",
    },
    {
        "id": "iphone_generic",
        "name": "iPhone (generic recent model)",
        "keywords": ["iphone", "i phone"],
        "dimensions": {"width_mm": 71.5, "height_mm": 147.0, "depth_mm": 8.0},
        "notes": "Generic iPhone dimensions. Camera bump ~4mm. USB-C at bottom center.",
    },
    {
        "id": "samsung_s24",
        "name": "Samsung Galaxy S24",
        "keywords": ["samsung s24", "galaxy s24", "samsung galaxy"],
        "dimensions": {"width_mm": 70.6, "height_mm": 147.0, "depth_mm": 7.6},
        "notes": "Triple camera module top-left rear. USB-C bottom center.",
    },
    {
        "id": "pixel_8",
        "name": "Google Pixel 8",
        "keywords": ["pixel 8", "google pixel"],
        "dimensions": {"width_mm": 70.8, "height_mm": 150.5, "depth_mm": 8.9},
        "notes": "Camera bar across full width of rear. USB-C bottom center.",
    },

    # ── Tablets ───────────────────────────────────────────────────────────────
    {
        "id": "ipad_pro_11",
        "name": "iPad Pro 11-inch",
        "keywords": ["ipad pro 11", "ipad pro"],
        "dimensions": {"width_mm": 178.5, "height_mm": 247.6, "depth_mm": 5.9},
        "notes": "USB-C/Thunderbolt at bottom. Magic Keyboard connector on back.",
    },
    {
        "id": "ipad_pro_13",
        "name": "iPad Pro 13-inch",
        "keywords": ["ipad pro 13", "ipad 13"],
        "dimensions": {"width_mm": 215.5, "height_mm": 281.6, "depth_mm": 5.1},
        "notes": "USB-C/Thunderbolt at bottom edge.",
    },

    # ── Laptops ───────────────────────────────────────────────────────────────
    {
        "id": "macbook_pro_14",
        "name": "MacBook Pro 14-inch",
        "keywords": ["macbook pro 14", "macbook 14", "mbp 14"],
        "dimensions": {"width_mm": 312.6, "height_mm": 221.2, "depth_mm": 15.5},
        "notes": "MagSafe left, HDMI + SD right, 2x Thunderbolt left.",
    },
    {
        "id": "macbook_pro_16",
        "name": "MacBook Pro 16-inch",
        "keywords": ["macbook pro 16", "macbook 16", "mbp 16"],
        "dimensions": {"width_mm": 355.7, "height_mm": 248.1, "depth_mm": 16.8},
        "notes": "Same port layout as 14-inch.",
    },

    # ── Cameras & Action Cams ─────────────────────────────────────────────────
    {
        "id": "gopro_hero",
        "name": "GoPro Hero 12 Black",
        "keywords": ["gopro", "go pro", "gopro hero"],
        "dimensions": {"width_mm": 71.8, "height_mm": 50.8, "depth_mm": 33.6},
        "notes": "Mount interface: 2-prong, 14.7mm spacing, 3mm prong width. 1/4-20 tripod thread on bottom frame.",
    },
    {
        "id": "gopro_mount_interface",
        "name": "GoPro mount interface",
        "keywords": ["gopro mount", "gopro bracket", "gopro adapter"],
        "dimensions": {"prong_spacing_mm": 14.7, "prong_width_mm": 3.0, "prong_depth_mm": 8.0, "bolt_mm": 5.0},
        "notes": "Standard 2-prong finger mount. M5 thumb screw through all prongs.",
    },

    # ── Audio & Wearables ─────────────────────────────────────────────────────
    {
        "id": "airpods_pro_case",
        "name": "AirPods Pro Case",
        "keywords": ["airpods case", "airpods pro", "airpod"],
        "dimensions": {"width_mm": 60.6, "height_mm": 45.2, "depth_mm": 21.7},
        "notes": "Lightning or USB-C at bottom. Lanyard loop on right side.",
    },

    # ── Gaming ────────────────────────────────────────────────────────────────
    {
        "id": "nintendo_switch",
        "name": "Nintendo Switch",
        "keywords": ["nintendo switch", "switch console"],
        "dimensions": {"width_mm": 239.0, "height_mm": 102.0, "depth_mm": 13.9},
        "notes": "Joy-Con rail slots on each side. USB-C bottom center. Kickstand on back.",
    },
    {
        "id": "steam_deck",
        "name": "Steam Deck",
        "keywords": ["steam deck", "steamdeck"],
        "dimensions": {"width_mm": 298.0, "height_mm": 117.0, "depth_mm": 49.0},
        "notes": "USB-C top center. Trackpads on front. Grip handles on sides.",
    },

    # ── Fasteners (Metric) ────────────────────────────────────────────────────
    {
        "id": "m3_bolt",
        "name": "M3 Socket Head Cap Screw",
        "keywords": ["m3 bolt", "m3 screw", "m3 socket"],
        "dimensions": {"shaft_dia_mm": 3.0, "head_dia_mm": 5.5, "head_height_mm": 3.0, "pitch_mm": 0.5},
        "notes": "Clearance hole: 3.4mm. Tapped hole: 2.5mm drill.",
    },
    {
        "id": "m4_bolt",
        "name": "M4 Socket Head Cap Screw",
        "keywords": ["m4 bolt", "m4 screw", "m4 socket"],
        "dimensions": {"shaft_dia_mm": 4.0, "head_dia_mm": 7.0, "head_height_mm": 4.0, "pitch_mm": 0.7},
        "notes": "Clearance hole: 4.5mm. Tapped hole: 3.3mm drill.",
    },
    {
        "id": "m5_bolt",
        "name": "M5 Socket Head Cap Screw",
        "keywords": ["m5 bolt", "m5 screw", "m5 socket"],
        "dimensions": {"shaft_dia_mm": 5.0, "head_dia_mm": 8.5, "head_height_mm": 5.0, "pitch_mm": 0.8},
        "notes": "Clearance hole: 5.5mm. Tapped hole: 4.2mm drill.",
    },
    {
        "id": "m6_bolt",
        "name": "M6 Socket Head Cap Screw",
        "keywords": ["m6 bolt", "m6 screw", "m6 socket", "m6"],
        "dimensions": {"shaft_dia_mm": 6.0, "head_dia_mm": 10.0, "head_height_mm": 6.0, "pitch_mm": 1.0},
        "notes": "Clearance hole: 6.6mm. Tapped hole: 5.0mm drill.",
    },
    {
        "id": "m8_bolt",
        "name": "M8 Socket Head Cap Screw",
        "keywords": ["m8 bolt", "m8 screw", "m8 socket", "m8"],
        "dimensions": {"shaft_dia_mm": 8.0, "head_dia_mm": 13.0, "head_height_mm": 8.0, "pitch_mm": 1.25},
        "notes": "Clearance hole: 9.0mm. Tapped hole: 6.8mm drill.",
    },
    {
        "id": "m10_bolt",
        "name": "M10 Socket Head Cap Screw",
        "keywords": ["m10 bolt", "m10 screw", "m10 socket", "m10"],
        "dimensions": {"shaft_dia_mm": 10.0, "head_dia_mm": 16.0, "head_height_mm": 10.0, "pitch_mm": 1.5},
        "notes": "Clearance hole: 11.0mm. Tapped hole: 8.5mm drill.",
    },
    {
        "id": "quarter_20",
        "name": "1/4-20 UNC Bolt (tripod standard)",
        "keywords": ["1/4-20", "quarter 20", "tripod bolt", "tripod mount", "1/4 inch"],
        "dimensions": {"shaft_dia_mm": 6.35, "head_dia_mm": 11.0, "pitch_mm": 1.27},
        "notes": "Standard tripod/camera mount thread. Very common in camera accessories.",
    },

    # ── Common Objects ────────────────────────────────────────────────────────
    {
        "id": "soda_can_12oz",
        "name": "Standard 12oz Soda Can",
        "keywords": ["can", "soda can", "beer can", "12oz can", "drink can"],
        "dimensions": {"diameter_mm": 66.0, "height_mm": 122.0},
        "notes": "Standard US 12oz / 355ml aluminum can.",
    },
    {
        "id": "coffee_mug",
        "name": "Standard Coffee Mug",
        "keywords": ["coffee mug", "mug", "cup"],
        "dimensions": {"diameter_mm": 80.0, "height_mm": 95.0, "handle_width_mm": 30.0},
        "notes": "Typical 12oz ceramic mug. Handle protrudes ~30mm from body.",
    },
    {
        "id": "water_bottle",
        "name": "Standard Water Bottle (500ml)",
        "keywords": ["water bottle", "bottle", "nalgene"],
        "dimensions": {"diameter_mm": 70.0, "height_mm": 210.0, "cap_dia_mm": 45.0},
        "notes": "Typical 500ml water bottle. Cap/neck ~45mm diameter.",
    },
    {
        "id": "credit_card",
        "name": "Credit Card (ISO 7810 ID-1)",
        "keywords": ["credit card", "card", "bank card", "id card"],
        "dimensions": {"width_mm": 85.6, "height_mm": 53.98, "depth_mm": 0.76},
        "notes": "ISO 7810 standard. Corner radius 3.18mm.",
    },
    {
        "id": "aa_battery",
        "name": "AA Battery",
        "keywords": ["aa battery", "aa cell", "double a"],
        "dimensions": {"diameter_mm": 14.5, "height_mm": 50.5},
        "notes": "IEC LR6. Positive terminal bump ~1mm.",
    },
    {
        "id": "bicycle_handlebar",
        "name": "Bicycle Handlebar",
        "keywords": ["handlebar", "bike handlebar", "bicycle bar"],
        "dimensions": {"grip_dia_mm": 22.2, "clamp_dia_mm": 31.8},
        "notes": "Grip section 22.2mm (7/8\"). Stem clamp 31.8mm (1-1/4\") or 25.4mm for older bikes.",
    },
    {
        "id": "rack_1u",
        "name": "1U Rack Mount (19-inch)",
        "keywords": ["1u rack", "rack mount", "19 inch rack", "server rack"],
        "dimensions": {"width_mm": 482.6, "height_mm": 44.45, "mounting_hole_spacing_mm": 465.1},
        "notes": "EIA-310 standard. Panel width 482.6mm (19\"). Height 1U = 44.45mm (1.75\").",
    },
    {
        "id": "arduino_uno",
        "name": "Arduino Uno R3",
        "keywords": ["arduino uno", "arduino", "uno r3"],
        "dimensions": {"width_mm": 53.4, "height_mm": 68.6, "depth_mm": 14.0,
                        "mounting_holes_mm": [[14.0, 2.54], [15.24, 50.8], [66.04, 7.62], [66.04, 35.56]],
                        "hole_diameter_mm": 3.2},
        "notes": "4 M3 mounting holes at asymmetric positions (from bottom-left corner): (14.0, 2.54), (15.24, 50.8), (66.04, 7.62), (66.04, 35.56). USB-B on short edge. Power barrel jack adjacent.",
    },
    {
        "id": "raspberry_pi_4",
        "name": "Raspberry Pi 4 Model B",
        "keywords": ["raspberry pi", "rpi", "raspi", "pi 4"],
        "dimensions": {"width_mm": 56.0, "height_mm": 85.0, "depth_mm": 17.0},
        "notes": "4 M2.5 mounting holes at 49mm × 58mm pattern. USB-C power, 2x micro-HDMI, 4x USB-A, Ethernet.",
    },
    {
        "id": "pen",
        "name": "Standard Pen/Pencil",
        "keywords": ["pen", "pencil", "stylus"],
        "dimensions": {"diameter_mm": 10.0, "length_mm": 150.0},
        "notes": "Typical ballpoint pen. Clip ~35mm long.",
    },
]


def find_matching_dimensions(user_prompt: str) -> list[dict]:
    """Find dimension reference entries that match keywords in the user's prompt."""
    prompt_lower = user_prompt.lower()
    matches = []
    for entry in DIMENSION_REFERENCE:
        for kw in entry["keywords"]:
            if kw in prompt_lower:
                matches.append(entry)
                break
    return matches


def format_dimension_context(matches: list[dict]) -> str:
    """Format matched dimensions as a text block for injection into prompts."""
    if not matches:
        return ""
    lines = ["\nREFERENCE DIMENSIONS (use these exact values when applicable):"]
    for m in matches:
        dims = ", ".join(f"{k}: {v}" for k, v in m["dimensions"].items())
        lines.append(f"- {m['name']}: {dims}")
        if m.get("notes"):
            lines.append(f"  Notes: {m['notes']}")
    return "\n".join(lines) + "\n"
