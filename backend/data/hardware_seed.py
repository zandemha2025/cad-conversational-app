"""
Seed script: 250+ hardware catalog items.
Run with: python -m backend.data.hardware_seed
Or call seed_hardware_catalog(supabase_client) from startup.
"""
import uuid

HARDWARE_ITEMS = [
    # ── Carr Lane — Renewable Bushings ──────────────────────────────────────────
    {"part_number":"CL-4-CBH",  "name":"Fixed Renewable Bushing ⌀4mm",  "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":8,  "id_mm":4,  "length_mm":16,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":4.85, "in_stock":True, "preferred":True},
    {"part_number":"CL-6-CBH",  "name":"Fixed Renewable Bushing ⌀6mm",  "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":10, "id_mm":6,  "length_mm":20,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":5.20, "in_stock":True, "preferred":False},
    {"part_number":"CL-8-CBH",  "name":"Fixed Renewable Bushing ⌀8mm",  "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":14, "id_mm":8,  "length_mm":22,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":6.15, "in_stock":True, "preferred":True},
    {"part_number":"CL-10-CBH", "name":"Fixed Renewable Bushing ⌀10mm", "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":16, "id_mm":10, "length_mm":25,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":7.40, "in_stock":True, "preferred":False},
    {"part_number":"CL-12-CBH", "name":"Fixed Renewable Bushing ⌀12mm", "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":20, "id_mm":12, "length_mm":28,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":8.90, "in_stock":True, "preferred":True},
    {"part_number":"CL-16-CBH", "name":"Fixed Renewable Bushing ⌀16mm", "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":26, "id_mm":16, "length_mm":32,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":11.25,"in_stock":False,"preferred":False},
    {"part_number":"CL-20-CBH", "name":"Fixed Renewable Bushing ⌀20mm", "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":32, "id_mm":20, "length_mm":36,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":14.80,"in_stock":True, "preferred":False},
    {"part_number":"CL-25-CBH", "name":"Fixed Renewable Bushing ⌀25mm", "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":40, "id_mm":25, "length_mm":40,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":19.50,"in_stock":True, "preferred":False},
    {"part_number":"CL-32-CBH", "name":"Fixed Renewable Bushing ⌀32mm", "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":50, "id_mm":32, "length_mm":50,"material":"H13 Tool Steel","hardness":"HRC60"},"price_usd":28.00,"in_stock":True, "preferred":False},
    {"part_number":"CL-4-LB",   "name":"Liner Bushing ⌀4mm",           "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":8,  "id_mm":4,  "length_mm":12,"type":"press_fit"},"price_usd":3.20,"in_stock":True,"preferred":False},
    {"part_number":"CL-8-LB",   "name":"Liner Bushing ⌀8mm",           "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":14, "id_mm":8,  "length_mm":18,"type":"press_fit"},"price_usd":4.80,"in_stock":True,"preferred":False},
    {"part_number":"CL-12-SB",  "name":"Slip-Renewable Bushing ⌀12mm", "category":"bushing","supplier":"Carr Lane","specs_json":{"od_mm":20, "id_mm":12, "length_mm":28,"type":"slip_renewable","lock":"quarter_turn"},"price_usd":11.20,"in_stock":True,"preferred":True},

    # ── Carr Lane — Clamps ───────────────────────────────────────────────────────
    {"part_number":"CL-150-STC","name":"Strap Clamp 150mm",             "category":"clamp","supplier":"Carr Lane","specs_json":{"reach_mm":150,"force_n":4500,"bolt_size":"M12"},"price_usd":18.50,"in_stock":True,"preferred":True},
    {"part_number":"CL-100-STC","name":"Strap Clamp 100mm",             "category":"clamp","supplier":"Carr Lane","specs_json":{"reach_mm":100,"force_n":3200,"bolt_size":"M10"},"price_usd":14.20,"in_stock":True,"preferred":False},
    {"part_number":"CL-200-STC","name":"Strap Clamp 200mm",             "category":"clamp","supplier":"Carr Lane","specs_json":{"reach_mm":200,"force_n":6000,"bolt_size":"M16"},"price_usd":26.80,"in_stock":True,"preferred":False},
    {"part_number":"CL-TCC-1",  "name":"Toe Clamp Set (4 pc)",          "category":"clamp","supplier":"Carr Lane","specs_json":{"force_n":2800,"slot_width_mm":14,"height_mm":25},"price_usd":42.00,"in_stock":True,"preferred":True},
    {"part_number":"CL-TCC-2",  "name":"Toe Clamp Set Heavy (4 pc)",    "category":"clamp","supplier":"Carr Lane","specs_json":{"force_n":5000,"slot_width_mm":18,"height_mm":30},"price_usd":58.00,"in_stock":True,"preferred":False},
    {"part_number":"CL-EP-50",  "name":"Edge Clamp Push-Pull 50mm",     "category":"clamp","supplier":"Carr Lane","specs_json":{"force_n":1800,"body_height_mm":50,"slot":"T"},"price_usd":22.40,"in_stock":True,"preferred":False},

    # ── Destaco — Toggle Clamps ──────────────────────────────────────────────────
    {"part_number":"225-U",   "name":"Vertical Hold-Down Toggle Clamp 225N",  "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":2250,"spindle_travel_mm":22,"base_w_mm":60},"price_usd":28.90,"in_stock":True,"preferred":True},
    {"part_number":"237-U",   "name":"Vertical Hold-Down Toggle Clamp 500N",  "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":5000,"spindle_travel_mm":28,"base_w_mm":76},"price_usd":38.50,"in_stock":True,"preferred":False},
    {"part_number":"247-U",   "name":"Vertical Hold-Down Toggle Clamp 1kN",   "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":10000,"spindle_travel_mm":35,"base_w_mm":95},"price_usd":52.00,"in_stock":True,"preferred":False},
    {"part_number":"5-202",   "name":"Swing Clamp 200N",                       "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":2000,"swing_angle_deg":90,"bore_mm":16},"price_usd":45.00,"in_stock":True,"preferred":True},
    {"part_number":"5-302",   "name":"Swing Clamp 500N",                       "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":5000,"swing_angle_deg":90,"bore_mm":20},"price_usd":68.00,"in_stock":False,"preferred":False},
    {"part_number":"827",     "name":"Horizontal Handle Toggle Clamp 900N",    "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":9000,"bar_height_mm":50,"base_w_mm":95},"price_usd":52.75,"in_stock":False,"preferred":False},
    {"part_number":"8M-200",  "name":"Pneumatic Toggle Clamp 2kN",             "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":20000,"cylinder_bore_mm":50,"stroke_mm":25,"pressure_bar":6},"price_usd":185.00,"in_stock":True,"preferred":False},
    {"part_number":"8M-400",  "name":"Pneumatic Toggle Clamp 4kN",             "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":40000,"cylinder_bore_mm":63,"stroke_mm":30,"pressure_bar":6},"price_usd":245.00,"in_stock":True,"preferred":False},
    {"part_number":"82M-4",   "name":"Pneumatic Swing Clamp 4kN",              "category":"clamp","supplier":"Destaco","specs_json":{"holding_force_n":40000,"swing_angle_deg":90,"stroke_mm":25},"price_usd":320.00,"in_stock":True,"preferred":False},

    # ── Jergens — Locating Pins ──────────────────────────────────────────────────
    {"part_number":"JER-DP-8",  "name":"Diamond Locating Pin ⌀8mm",  "category":"locator","supplier":"Jergens","specs_json":{"body_dia_mm":8, "relief_dia_mm":6, "length_mm":40,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":18.50,"in_stock":True,"preferred":False},
    {"part_number":"JER-DP-10", "name":"Diamond Locating Pin ⌀10mm", "category":"locator","supplier":"Jergens","specs_json":{"body_dia_mm":10,"relief_dia_mm":8, "length_mm":45,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":22.40,"in_stock":True,"preferred":True},
    {"part_number":"JER-DP-12", "name":"Diamond Locating Pin ⌀12mm", "category":"locator","supplier":"Jergens","specs_json":{"body_dia_mm":12,"relief_dia_mm":10,"length_mm":50,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":26.80,"in_stock":True,"preferred":False},
    {"part_number":"JER-DP-16", "name":"Diamond Locating Pin ⌀16mm", "category":"locator","supplier":"Jergens","specs_json":{"body_dia_mm":16,"relief_dia_mm":14,"length_mm":60,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":34.00,"in_stock":True,"preferred":False},
    {"part_number":"JER-RP-8",  "name":"Round Locating Pin ⌀8mm",   "category":"locator","supplier":"Jergens","specs_json":{"dia_mm":8, "length_mm":40,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":15.50,"in_stock":True,"preferred":False},
    {"part_number":"JER-RP-10", "name":"Round Locating Pin ⌀10mm",  "category":"locator","supplier":"Jergens","specs_json":{"dia_mm":10,"length_mm":45,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":19.50,"in_stock":True,"preferred":True},
    {"part_number":"JER-RP-12", "name":"Round Locating Pin ⌀12mm",  "category":"locator","supplier":"Jergens","specs_json":{"dia_mm":12,"length_mm":50,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":23.10,"in_stock":True,"preferred":False},
    {"part_number":"JER-RP-16", "name":"Round Locating Pin ⌀16mm",  "category":"locator","supplier":"Jergens","specs_json":{"dia_mm":16,"length_mm":60,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":31.50,"in_stock":False,"preferred":False},
    {"part_number":"JER-RP-20", "name":"Round Locating Pin ⌀20mm",  "category":"locator","supplier":"Jergens","specs_json":{"dia_mm":20,"length_mm":70,"material":"D2 Tool Steel","tolerance":"h6"},"price_usd":42.00,"in_stock":True,"preferred":False},
    {"part_number":"JER-QCP-10","name":"Quick-Change Pin ⌀10mm",    "category":"locator","supplier":"Jergens","specs_json":{"dia_mm":10,"pull_force_n":1200,"type":"quick_change"},"price_usd":48.00,"in_stock":True,"preferred":False},

    # ── Jergens — Chamfered Pins ─────────────────────────────────────────────────
    {"part_number":"JER-CP-M6", "name":"Chamfered Locating Pin M6 thread",  "category":"pin","supplier":"Jergens","specs_json":{"dia_mm":6, "thread":"M6", "length_mm":32,"chamfer_deg":15,"material":"D2 Tool Steel"},"price_usd":13.50,"in_stock":True,"preferred":False},
    {"part_number":"JER-CP-M8", "name":"Chamfered Locating Pin M8 thread",  "category":"pin","supplier":"Jergens","specs_json":{"dia_mm":8, "thread":"M8", "length_mm":38,"chamfer_deg":15,"material":"D2 Tool Steel"},"price_usd":16.80,"in_stock":True,"preferred":False},
    {"part_number":"JER-CP-M10","name":"Chamfered Locating Pin M10 thread", "category":"pin","supplier":"Jergens","specs_json":{"dia_mm":10,"thread":"M10","length_mm":45,"chamfer_deg":15,"material":"D2 Tool Steel"},"price_usd":21.50,"in_stock":True,"preferred":True},
    {"part_number":"JER-CP-M12","name":"Chamfered Locating Pin M12 thread", "category":"pin","supplier":"Jergens","specs_json":{"dia_mm":12,"thread":"M12","length_mm":52,"chamfer_deg":15,"material":"D2 Tool Steel"},"price_usd":25.90,"in_stock":True,"preferred":False},
    {"part_number":"JER-CP-M16","name":"Chamfered Locating Pin M16 thread", "category":"pin","supplier":"Jergens","specs_json":{"dia_mm":16,"thread":"M16","length_mm":62,"chamfer_deg":15,"material":"D2 Tool Steel"},"price_usd":34.00,"in_stock":False,"preferred":False},
    {"part_number":"JER-TP-10", "name":"Tapered Locating Pin ⌀10mm",        "category":"pin","supplier":"Jergens","specs_json":{"dia_mm":10,"taper_angle_deg":2,"length_mm":45},"price_usd":24.00,"in_stock":True,"preferred":False},

    # ── Misumi — Rest Buttons ────────────────────────────────────────────────────
    {"part_number":"SMABT16",   "name":"Rest Button ⌀16mm Flat Head", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":16,"height_mm":10,"load_kn":6,"material":"SUJ2 Bearing Steel","hardness":"HRC58"},"price_usd":6.80,"in_stock":True,"preferred":False},
    {"part_number":"SMABT20",   "name":"Rest Button ⌀20mm Flat Head", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":20,"height_mm":12,"load_kn":8,"material":"SUJ2 Bearing Steel","hardness":"HRC58"},"price_usd":7.50,"in_stock":True,"preferred":False},
    {"part_number":"SMABT25",   "name":"Rest Button ⌀25mm Flat Head", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":25,"height_mm":15,"load_kn":12,"material":"SUJ2 Bearing Steel","hardness":"HRC58"},"price_usd":9.80,"in_stock":True,"preferred":True},
    {"part_number":"SMABT32",   "name":"Rest Button ⌀32mm Flat Head", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":32,"height_mm":18,"load_kn":20,"material":"SUJ2 Bearing Steel","hardness":"HRC58"},"price_usd":12.30,"in_stock":True,"preferred":False},
    {"part_number":"SMABT40",   "name":"Rest Button ⌀40mm Flat Head", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":40,"height_mm":22,"load_kn":30,"material":"SUJ2 Bearing Steel","hardness":"HRC58"},"price_usd":16.80,"in_stock":True,"preferred":False},
    {"part_number":"PCBG20",    "name":"Counterbored Rest Pad ⌀20mm", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":20,"pad_height_mm":6,"bore_dia_mm":6, "material":"S45C Carbon Steel"},"price_usd":8.50,"in_stock":True,"preferred":False},
    {"part_number":"PCBG25",    "name":"Counterbored Rest Pad ⌀25mm", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":25,"pad_height_mm":7.5,"bore_dia_mm":8,"material":"S45C Carbon Steel"},"price_usd":11.20,"in_stock":True,"preferred":True},
    {"part_number":"PCBG32",    "name":"Counterbored Rest Pad ⌀32mm", "category":"support","supplier":"Misumi","specs_json":{"dia_mm":32,"pad_height_mm":10, "bore_dia_mm":10,"material":"S45C Carbon Steel"},"price_usd":14.60,"in_stock":True,"preferred":False},
    {"part_number":"SMABT25-V", "name":"Rest Button ⌀25mm V-Notch",  "category":"support","supplier":"Misumi","specs_json":{"dia_mm":25,"height_mm":15,"v_angle_deg":90,"load_kn":10},"price_usd":11.40,"in_stock":True,"preferred":False},
    {"part_number":"SMABT32-V", "name":"Rest Button ⌀32mm V-Notch",  "category":"support","supplier":"Misumi","specs_json":{"dia_mm":32,"height_mm":18,"v_angle_deg":90,"load_kn":16},"price_usd":14.80,"in_stock":True,"preferred":False},
    {"part_number":"CABT25",    "name":"Carbide Tipped Rest Button ⌀25mm","category":"support","supplier":"Misumi","specs_json":{"dia_mm":25,"height_mm":14,"tip":"WC-Co carbide","hardness":"HRA90"},"price_usd":28.50,"in_stock":True,"preferred":False},

    # ── Misumi — Suction Cups ────────────────────────────────────────────────────
    {"part_number":"ZPT-16-FLT", "name":"Suction Cup ⌀16mm Flat",    "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":16,"type":"flat","max_load_n":25,"thread":"M5"},"price_usd":3.20,"in_stock":True,"preferred":False},
    {"part_number":"ZPT-25-FLT", "name":"Suction Cup ⌀25mm Flat",    "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":25,"type":"flat","max_load_n":50,"thread":"M5"},"price_usd":4.20,"in_stock":True,"preferred":True},
    {"part_number":"ZPT-40-FLT", "name":"Suction Cup ⌀40mm Flat",    "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":40,"type":"flat","max_load_n":100,"thread":"M5"},"price_usd":5.80,"in_stock":True,"preferred":False},
    {"part_number":"ZPT-63-FLT", "name":"Suction Cup ⌀63mm Flat",    "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":63,"type":"flat","max_load_n":200,"thread":"M8"},"price_usd":8.20,"in_stock":True,"preferred":False},
    {"part_number":"ZPT-25-BS",  "name":"Suction Cup ⌀25mm Bellows", "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":25,"type":"bellows","max_load_n":55,"thread":"M5","folds":1.5},"price_usd":4.80,"in_stock":True,"preferred":False},
    {"part_number":"ZPT-40-BS",  "name":"Suction Cup ⌀40mm Bellows", "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":40,"type":"bellows","max_load_n":120,"thread":"M5","folds":1.5},"price_usd":6.40,"in_stock":True,"preferred":True},
    {"part_number":"ZPT-60-BS",  "name":"Suction Cup ⌀60mm Bellows", "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":60,"type":"bellows","max_load_n":280,"thread":"M8","folds":2.5},"price_usd":9.20,"in_stock":True,"preferred":False},
    {"part_number":"ZPT-80-BS",  "name":"Suction Cup ⌀80mm Bellows", "category":"suction","supplier":"Misumi","specs_json":{"dia_mm":80,"type":"bellows","max_load_n":500,"thread":"M8","folds":2.5},"price_usd":13.50,"in_stock":False,"preferred":False},
    {"part_number":"ZPT-40-SIL", "name":"Suction Cup ⌀40mm Silicone","category":"suction","supplier":"Misumi","specs_json":{"dia_mm":40,"type":"flat","material":"food_grade_silicone","max_load_n":90,"thread":"M5"},"price_usd":7.80,"in_stock":True,"preferred":False},

    # ── Holo-Krome — Socket Head Cap Screws ─────────────────────────────────────
    {"part_number":"HK-M5-10-12", "name":"SHCS M5×10 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M5","length_mm":10,"grade":"12.9","drive":"hex socket"},"price_usd":0.45,"in_stock":True,"preferred":False},
    {"part_number":"HK-M5-16-12", "name":"SHCS M5×16 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M5","length_mm":16,"grade":"12.9","drive":"hex socket"},"price_usd":0.55,"in_stock":True,"preferred":False},
    {"part_number":"HK-M6-16-12", "name":"SHCS M6×16 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M6","length_mm":16,"grade":"12.9","drive":"hex socket"},"price_usd":0.65,"in_stock":True,"preferred":True},
    {"part_number":"HK-M6-25-12", "name":"SHCS M6×25 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M6","length_mm":25,"grade":"12.9","drive":"hex socket"},"price_usd":0.75,"in_stock":True,"preferred":False},
    {"part_number":"HK-M8-20-12", "name":"SHCS M8×20 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M8","length_mm":20,"grade":"12.9","drive":"hex socket"},"price_usd":0.95,"in_stock":True,"preferred":False},
    {"part_number":"HK-M8-25-12", "name":"SHCS M8×25 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M8","length_mm":25,"grade":"12.9","drive":"hex socket"},"price_usd":1.10,"in_stock":True,"preferred":True},
    {"part_number":"HK-M8-40-12", "name":"SHCS M8×40 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M8","length_mm":40,"grade":"12.9","drive":"hex socket"},"price_usd":1.35,"in_stock":True,"preferred":False},
    {"part_number":"HK-M10-25-12","name":"SHCS M10×25 Grade 12.9", "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M10","length_mm":25,"grade":"12.9","drive":"hex socket"},"price_usd":1.50,"in_stock":True,"preferred":False},
    {"part_number":"HK-M10-30-12","name":"SHCS M10×30 Grade 12.9", "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M10","length_mm":30,"grade":"12.9","drive":"hex socket"},"price_usd":1.65,"in_stock":True,"preferred":True},
    {"part_number":"HK-M10-50-12","name":"SHCS M10×50 Grade 12.9", "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M10","length_mm":50,"grade":"12.9","drive":"hex socket"},"price_usd":2.10,"in_stock":True,"preferred":False},
    {"part_number":"HK-M12-30-12","name":"SHCS M12×30 Grade 12.9", "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M12","length_mm":30,"grade":"12.9","drive":"hex socket"},"price_usd":2.20,"in_stock":True,"preferred":False},
    {"part_number":"HK-M12-40-12","name":"SHCS M12×40 Grade 12.9", "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M12","length_mm":40,"grade":"12.9","drive":"hex socket"},"price_usd":2.65,"in_stock":True,"preferred":True},
    {"part_number":"HK-M16-40-12","name":"SHCS M16×40 Grade 12.9", "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M16","length_mm":40,"grade":"12.9","drive":"hex socket"},"price_usd":4.00,"in_stock":True,"preferred":False},
    {"part_number":"HK-M16-50-12","name":"SHCS M16×50 Grade 12.9", "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M16","length_mm":50,"grade":"12.9","drive":"hex socket"},"price_usd":4.80,"in_stock":True,"preferred":False},
    {"part_number":"HK-M8-TB-12", "name":"T-Bolt M8 Grade 12.9",   "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M8","slot_width_mm":14,"grade":"12.9"},"price_usd":2.90,"in_stock":True,"preferred":True},
    {"part_number":"HK-M10-TB-12","name":"T-Bolt M10 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M10","slot_width_mm":18,"grade":"12.9"},"price_usd":4.20,"in_stock":True,"preferred":False},
    {"part_number":"HK-M12-TB-12","name":"T-Bolt M12 Grade 12.9",  "category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M12","slot_width_mm":22,"grade":"12.9"},"price_usd":5.60,"in_stock":True,"preferred":False},
    {"part_number":"HK-M8-25-A2", "name":"SHCS M8×25 A2 Stainless","category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M8","length_mm":25,"grade":"A2-70","drive":"hex socket","corrosion":"good"},"price_usd":0.85,"in_stock":True,"preferred":False},
    {"part_number":"HK-M10-30-A2","name":"SHCS M10×30 A2 Stainless","category":"fastener","supplier":"Holo-Krome","specs_json":{"thread":"M10","length_mm":30,"grade":"A2-70","drive":"hex socket","corrosion":"good"},"price_usd":1.25,"in_stock":True,"preferred":False},

    # ── ISO Flanges ───────────────────────────────────────────────────────────────
    {"part_number":"ISO-9409-31", "name":"ISO 9409-1 Flange ⌀31mm",   "category":"flange","supplier":"Misumi","specs_json":{"flange_dia_mm":31.5,"bolt_circle_mm":25,"bolts":"3×M5", "centering_pin_mm":4,"standard":"ISO 9409-1"},"price_usd":42.00,"in_stock":True,"preferred":False},
    {"part_number":"ISO-9409-50", "name":"ISO 9409-1 Flange ⌀50mm",   "category":"flange","supplier":"Misumi","specs_json":{"flange_dia_mm":50,  "bolt_circle_mm":40,"bolts":"4×M6", "centering_pin_mm":6,"standard":"ISO 9409-1"},"price_usd":68.00,"in_stock":True,"preferred":True},
    {"part_number":"ISO-9409-63", "name":"ISO 9409-1 Flange ⌀63mm",   "category":"flange","supplier":"Misumi","specs_json":{"flange_dia_mm":63,  "bolt_circle_mm":50,"bolts":"4×M8", "centering_pin_mm":8,"standard":"ISO 9409-1"},"price_usd":92.00,"in_stock":True,"preferred":False},
    {"part_number":"ISO-9409-80", "name":"ISO 9409-1 Flange ⌀80mm",   "category":"flange","supplier":"Misumi","specs_json":{"flange_dia_mm":80,  "bolt_circle_mm":65,"bolts":"4×M8", "centering_pin_mm":8,"standard":"ISO 9409-1"},"price_usd":118.00,"in_stock":True,"preferred":False},
    {"part_number":"ISO-9409-100","name":"ISO 9409-1 Flange ⌀100mm",  "category":"flange","supplier":"Misumi","specs_json":{"flange_dia_mm":100, "bolt_circle_mm":80,"bolts":"4×M10","centering_pin_mm":12,"standard":"ISO 9409-1"},"price_usd":145.00,"in_stock":False,"preferred":False},
    {"part_number":"ISO-9409-125","name":"ISO 9409-1 Flange ⌀125mm",  "category":"flange","supplier":"Misumi","specs_json":{"flange_dia_mm":125, "bolt_circle_mm":100,"bolts":"6×M10","centering_pin_mm":12,"standard":"ISO 9409-1"},"price_usd":195.00,"in_stock":True,"preferred":False},
    {"part_number":"QC-60",      "name":"Quick-Change Flange ⌀60mm",  "category":"flange","supplier":"Destaco","specs_json":{"flange_dia_mm":60,"change_time_sec":5,"repeatability_mm":0.01,"max_payload_kg":10},"price_usd":380.00,"in_stock":True,"preferred":False},
    {"part_number":"QC-100",     "name":"Quick-Change Flange ⌀100mm", "category":"flange","supplier":"Destaco","specs_json":{"flange_dia_mm":100,"change_time_sec":6,"repeatability_mm":0.01,"max_payload_kg":25},"price_usd":520.00,"in_stock":True,"preferred":False},
]


def seed_hardware_catalog(supabase_client) -> int:
    """Insert hardware items. Returns number inserted."""
    # Check if already seeded
    existing = supabase_client.table("hardware_catalog").select("id").limit(1).execute()
    if existing.data:
        return 0

    records = [{"id": str(uuid.uuid4()), **item} for item in HARDWARE_ITEMS]
    supabase_client.table("hardware_catalog").insert(records).execute()
    return len(records)


if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from app.core.database import get_supabase_client
    sb = get_supabase_client()
    n = seed_hardware_catalog(sb)
    print(f"Seeded {n} hardware items")
