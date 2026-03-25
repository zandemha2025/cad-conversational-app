"""
Standard fixture component catalog.
Used by the components library endpoint and AI suggestion system.
"""

STANDARD_COMPONENTS = [
    # ── CLAMPS ─────────────────────────────────────────────────────────────────
    {
        "id": "toggle_clamp_small",
        "name": "Toggle Clamp - Small (GH-201A)",
        "category": "clamps",
        "description": "Vertical toggle clamp, 50lb holding capacity. Ideal for light fixturing.",
        "specifications": {
            "holding_force_lbs": 50,
            "opening_mm": 28,
            "base_bolt_pattern": "2x M5 @ 32mm",
        },
        "prompt_hint": "small vertical toggle clamp with 50lb holding capacity, M5 bolt pattern at 32mm spacing",
        "thumbnail": "toggle_clamp_small.svg",
    },
    {
        "id": "toggle_clamp_medium",
        "name": "Toggle Clamp - Medium (GH-225D)",
        "category": "clamps",
        "description": "Horizontal toggle clamp, 500lb holding capacity. For medium duty fixturing.",
        "specifications": {
            "holding_force_lbs": 500,
            "opening_mm": 40,
            "base_bolt_pattern": "2x M6 @ 50mm",
        },
        "prompt_hint": "medium horizontal toggle clamp with 500lb holding capacity",
    },
    {
        "id": "toggle_clamp_heavy",
        "name": "Toggle Clamp - Heavy (GH-375)",
        "category": "clamps",
        "description": "Vertical toggle clamp, 750lb holding capacity. For heavy duty applications.",
        "specifications": {
            "holding_force_lbs": 750,
            "opening_mm": 55,
            "base_bolt_pattern": "4x M8 @ 65mm",
        },
        "prompt_hint": "heavy duty vertical toggle clamp with 750lb holding capacity",
    },
    # ── LOCATING PINS ──────────────────────────────────────────────────────────
    {
        "id": "dowel_pin_6mm",
        "name": "Dowel Pin - 6mm × 20mm",
        "category": "pins",
        "description": "Precision ground dowel pin, h6 tolerance. For accurate part location.",
        "specifications": {
            "diameter_mm": 6,
            "length_mm": 20,
            "tolerance": "h6",
            "material": "Hardened Steel",
        },
        "prompt_hint": "6mm precision dowel pin, 20mm long, h6 tolerance",
    },
    {
        "id": "dowel_pin_8mm",
        "name": "Dowel Pin - 8mm × 25mm",
        "category": "pins",
        "description": "Precision ground dowel pin, h6 tolerance.",
        "specifications": {
            "diameter_mm": 8,
            "length_mm": 25,
            "tolerance": "h6",
            "material": "Hardened Steel",
        },
        "prompt_hint": "8mm precision dowel pin, 25mm long",
    },
    {
        "id": "diamond_pin_6mm",
        "name": "Diamond Locating Pin - 6mm",
        "category": "pins",
        "description": "Diamond-shaped locating pin for secondary datum. Prevents over-constraint.",
        "specifications": {
            "diameter_mm": 6,
            "length_mm": 20,
            "material": "Hardened Steel",
        },
        "prompt_hint": "6mm diamond locating pin for secondary datum location",
    },
    # ── FASTENERS ──────────────────────────────────────────────────────────────
    {
        "id": "tslot_nut_m8",
        "name": "T-Slot Nut - M8",
        "category": "fasteners",
        "description": "T-slot nut for fixture base mounting on machine table.",
        "specifications": {
            "thread": "M8",
            "slot_width_mm": 14,
            "material": "Steel",
        },
        "prompt_hint": "M8 T-slot nut for 14mm slot",
    },
    {
        "id": "socket_head_m6",
        "name": "Socket Head Cap Screw - M6 × 20mm",
        "category": "fasteners",
        "description": "12.9 grade socket head cap screw.",
        "specifications": {
            "thread": "M6",
            "length_mm": 20,
            "head": "socket",
            "material": "12.9 Steel",
        },
        "prompt_hint": "M6x20 socket head cap screw, 12.9 grade",
    },
    # ── SUPPORTS ───────────────────────────────────────────────────────────────
    {
        "id": "rest_pad_25mm",
        "name": "Rest Pad - 25mm Round",
        "category": "supports",
        "description": "Adjustable rest pad for supporting workpiece. Serrated top surface.",
        "specifications": {
            "diameter_mm": 25,
            "height_mm": 15,
            "thread": "M8",
            "material": "Hardened Steel",
        },
        "prompt_hint": "25mm round rest pad with M8 thread and serrated surface",
    },
    {
        "id": "spring_plunger_m6",
        "name": "Spring Plunger - M6",
        "category": "supports",
        "description": "Ball spring plunger for flexible part support/location.",
        "specifications": {
            "thread": "M6",
            "force_n": 10,
            "travel_mm": 3,
        },
        "prompt_hint": "M6 ball spring plunger, 10N force",
    },
    {
        "id": "riser_block_50mm",
        "name": "Riser Block - 50mm",
        "category": "supports",
        "description": "Precision riser block for elevating fixture components.",
        "specifications": {
            "width_mm": 40,
            "depth_mm": 40,
            "height_mm": 50,
            "material": "Steel",
        },
        "prompt_hint": "50mm steel riser block, 40x40mm base",
    },
    # ── BASE PLATES ────────────────────────────────────────────────────────────
    {
        "id": "fixture_plate_200x200",
        "name": "Fixture Base Plate - 200×200×20mm",
        "category": "bases",
        "description": "Precision ground base plate with M8 grid holes on 25mm centers.",
        "specifications": {
            "width_mm": 200,
            "depth_mm": 200,
            "height_mm": 20,
            "hole_pattern": "M8 @ 25mm grid",
            "material": "6061-T6 Aluminum",
        },
        "prompt_hint": "200x200x20mm aluminum fixture base plate with M8 grid holes on 25mm centers",
    },
    {
        "id": "fixture_plate_300x200",
        "name": "Fixture Base Plate - 300×200×25mm",
        "category": "bases",
        "description": "Precision ground base plate with M8 grid holes on 25mm centers.",
        "specifications": {
            "width_mm": 300,
            "depth_mm": 200,
            "height_mm": 25,
            "hole_pattern": "M8 @ 25mm grid",
            "material": "6061-T6 Aluminum",
        },
        "prompt_hint": "300x200x25mm aluminum fixture base plate with M8 grid holes",
    },
    # ── END EFFECTORS ──────────────────────────────────────────────────────────
    {
        "id": "vacuum_cup_30mm",
        "name": "Vacuum Cup - 30mm Flat",
        "category": "end_effectors",
        "description": "Flat vacuum suction cup for pick-and-place. NBR rubber.",
        "specifications": {
            "diameter_mm": 30,
            "type": "flat",
            "material": "NBR",
            "fitting": "G1/8",
        },
        "prompt_hint": "30mm flat NBR vacuum suction cup with G1/8 fitting",
    },
    {
        "id": "gripper_parallel_40mm",
        "name": "Parallel Gripper - 40mm Stroke",
        "category": "end_effectors",
        "description": "Pneumatic parallel gripper for automated handling.",
        "specifications": {
            "stroke_mm": 40,
            "grip_force_n": 80,
            "type": "parallel",
        },
        "prompt_hint": "pneumatic parallel gripper with 40mm stroke and 80N grip force",
    },
]

# Category metadata — name, icon (Lucide), and color
CATEGORIES = {
    "clamps":       {"name": "Clamps",          "icon": "grip",   "color": "#3B82F6"},
    "pins":         {"name": "Locating Pins",   "icon": "pin",    "color": "#F59E0B"},
    "fasteners":    {"name": "Fasteners",       "icon": "wrench", "color": "#6B7280"},
    "supports":     {"name": "Supports & Rests","icon": "layers", "color": "#10B981"},
    "bases":        {"name": "Base Plates",     "icon": "square", "color": "#8B5CF6"},
    "end_effectors":{"name": "End Effectors",   "icon": "move",   "color": "#EF4444"},
}

# Build an id→component lookup for O(1) access
_COMPONENT_BY_ID = {c["id"]: c for c in STANDARD_COMPONENTS}


def get_component(component_id: str) -> dict | None:
    return _COMPONENT_BY_ID.get(component_id)


def get_components_by_category(category: str) -> list[dict]:
    return [c for c in STANDARD_COMPONENTS if c["category"] == category]
