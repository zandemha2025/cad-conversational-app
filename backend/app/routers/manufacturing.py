"""
Manufacturing Planning endpoints:
  - Machine profiles (CRUD + presets)
  - Cost estimation (Gemini-powered)
  - Inventory management (CSV/Excel upload, list, BOM matching)
  - Shopping list generation (Gemini-powered)
"""
import csv
import io
import json
import uuid
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel

from app.api.deps import get_current_user_id
from app.core.database import get_supabase_client
from app.data.machine_presets import MACHINE_PRESETS
from app.services.cost_engine import estimate_manufacturing_cost
from app.services.gemini_service import GeminiService

log = logging.getLogger(__name__)

router = APIRouter(tags=["manufacturing"])

_gemini = GeminiService()

TABLE_MACHINES = "machine_profiles"
TABLE_INVENTORY = "user_inventory"


# ── Machine Profiles ──────────────────────────────────────────────────────────

class MachineCreate(BaseModel):
    name: str
    machine_type: str
    make_model: str | None = None
    build_volume_json: dict | None = None
    materials_available: list[str] | None = None
    hourly_rate: float | None = None
    setup_time_minutes: int = 30
    notes: str | None = None


@router.get("/manufacturing/machines")
async def list_machines(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase_client()
    res = sb.table(TABLE_MACHINES).select("*").eq("user_id", user_id).order("created_at").execute()
    return res.data or []


@router.get("/manufacturing/machines/presets")
async def get_machine_presets():
    """Return common machine presets for one-click adding."""
    return MACHINE_PRESETS


@router.post("/manufacturing/machines", status_code=201)
async def add_machine(body: MachineCreate, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase_client()
    row = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "name": body.name,
        "machine_type": body.machine_type,
        "make_model": body.make_model,
        "build_volume_json": body.build_volume_json,
        "materials_available": body.materials_available,
        "hourly_rate": body.hourly_rate,
        "setup_time_minutes": body.setup_time_minutes,
        "notes": body.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = sb.table(TABLE_MACHINES).insert(row).execute()
    return res.data[0]


@router.delete("/manufacturing/machines/{machine_id}", status_code=204)
async def delete_machine(machine_id: str, user_id: str = Depends(get_current_user_id)):
    sb = get_supabase_client()
    sb.table(TABLE_MACHINES).delete().eq("id", machine_id).eq("user_id", user_id).execute()
    return None


# ── Cost Estimation ───────────────────────────────────────────────────────────

class CostEstimateRequest(BaseModel):
    design_description: str = ""
    dimensions_json: list = []
    machine_ids: list[str] | None = None  # None = use all user machines


@router.post("/projects/{project_id}/manufacturing/estimate")
async def estimate_cost(
    project_id: str,
    body: CostEstimateRequest,
    user_id: str = Depends(get_current_user_id),
):
    sb = get_supabase_client()

    # Project context
    proj_res = sb.table("projects").select("*").eq("id", project_id).single().execute()
    proj = proj_res.data or {}

    description = body.design_description or (
        f"{proj.get('name', '')} {proj.get('description', '') or ''}".strip()
    )

    # Part dimensions from geometry if not provided
    dims = body.dimensions_json
    if not dims:
        geom = (
            sb.table("part_geometries")
            .select("features_json")
            .eq("project_id", project_id)
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if geom.data:
            bb = (geom.data[0].get("features_json") or {}).get("bounding_box", {})
            if bb:
                dims = [bb]

    # User's machines
    q = sb.table(TABLE_MACHINES).select("*").eq("user_id", user_id)
    if body.machine_ids:
        q = q.in_("id", body.machine_ids)
    machines = q.execute().data or []

    if not machines:
        raise HTTPException(
            status_code=400,
            detail="No machines configured. Add machines at GET /api/manufacturing/machines/presets then POST /api/manufacturing/machines.",
        )

    return await estimate_manufacturing_cost(description, dims, machines, _gemini)


# ── Inventory — CSV/Excel Upload ──────────────────────────────────────────────

# Flexible column name aliases → canonical field names
_COLUMN_ALIASES: dict[str, list[str]] = {
    "part_number":           ["part_number", "part#", "part #", "pn", "partnumber", "part no", "part_no"],
    "description":           ["description", "desc", "name", "item", "component", "part_name"],
    "quantity_on_hand":      ["quantity", "qty", "quantity_on_hand", "on_hand", "stock", "count", "qty_on_hand"],
    "unit_cost":             ["unit_cost", "cost", "price", "unit_price", "each", "cost_each"],
    "supplier":              ["supplier", "vendor", "manufacturer", "mfr"],
    "supplier_part_number":  ["supplier_part_number", "vendor_part", "mfr_part", "catalog_no", "catalog#", "spn"],
    "category":              ["category", "type", "classification", "cat"],
    "notes":                 ["notes", "note", "comments", "comment", "remarks"],
}


def _normalize_headers(headers: list[str]) -> dict[str, str]:
    """Map raw CSV/Excel headers → canonical field names."""
    mapping: dict[str, str] = {}
    for h in headers:
        normalized = h.strip().lower().replace(" ", "_").replace("-", "_")
        for field, aliases in _COLUMN_ALIASES.items():
            if normalized in aliases:
                mapping[h] = field
                break
    return mapping


def _coerce_row(item: dict) -> dict:
    if "quantity_on_hand" in item:
        try:
            item["quantity_on_hand"] = int(float(item["quantity_on_hand"])) if item["quantity_on_hand"] else 0
        except (ValueError, TypeError):
            item["quantity_on_hand"] = 0
    if "unit_cost" in item:
        try:
            raw = str(item["unit_cost"]).replace("$", "").replace(",", "").strip()
            item["unit_cost"] = float(raw) if raw else None
        except (ValueError, TypeError):
            item["unit_cost"] = None
    return item


def _parse_csv_bytes(content: bytes) -> list[dict]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no headers")

    header_map = _normalize_headers(list(reader.fieldnames))
    rows = []
    for row in reader:
        item: dict = {}
        for csv_col, field in header_map.items():
            item[field] = str(row.get(csv_col, "") or "").strip()
        if not item.get("description"):
            continue
        rows.append(_coerce_row(item))
    return rows


def _parse_excel_bytes(content: bytes) -> list[dict]:
    try:
        import openpyxl
    except ImportError:
        raise HTTPException(
            status_code=400,
            detail="Excel support requires openpyxl. Upload a CSV instead.",
        )
    wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    headers = [str(c or "").strip() for c in next(rows_iter, [])]
    header_map = _normalize_headers(headers)

    rows = []
    for raw_row in rows_iter:
        item: dict = {}
        for i, h in enumerate(headers):
            if h in header_map:
                val = raw_row[i] if i < len(raw_row) else None
                item[header_map[h]] = str(val).strip() if val is not None else ""
        if item.get("description"):
            rows.append(_coerce_row(item))
    return rows


@router.post("/manufacturing/inventory/upload", status_code=201)
async def upload_inventory(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload a CSV or Excel file to populate user inventory."""
    content = await file.read()
    filename = (file.filename or "").lower()

    if filename.endswith((".xlsx", ".xls")):
        rows = _parse_excel_bytes(content)
    else:
        rows = _parse_csv_bytes(content)

    if not rows:
        raise HTTPException(status_code=400, detail="No valid rows found in file")

    sb = get_supabase_client()
    now = datetime.now(timezone.utc).isoformat()
    records = [
        {"id": str(uuid.uuid4()), "user_id": user_id, "created_at": now, **r}
        for r in rows
    ]

    inserted = 0
    for i in range(0, len(records), 500):
        res = sb.table(TABLE_INVENTORY).insert(records[i : i + 500]).execute()
        inserted += len(res.data or [])

    return {"inserted": inserted, "total_rows": len(rows)}


@router.get("/manufacturing/inventory")
async def list_inventory(user_id: str = Depends(get_current_user_id)):
    sb = get_supabase_client()
    res = sb.table(TABLE_INVENTORY).select("*").eq("user_id", user_id).order("description").execute()
    return res.data or []


# ── Inventory BOM Matching ────────────────────────────────────────────────────

class BomMatchRequest(BaseModel):
    project_id: str | None = None
    bom_items: list[dict] | None = None  # Override BOM from DB if provided


@router.post("/manufacturing/inventory/match")
async def match_inventory(
    body: BomMatchRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Match project BOM against user inventory. Returns matched + missing items."""
    sb = get_supabase_client()

    bom_items = body.bom_items or []
    if not bom_items and body.project_id:
        res = sb.table("bom_items").select("*").eq("project_id", body.project_id).execute()
        bom_items = res.data or []

    inv_res = sb.table(TABLE_INVENTORY).select("*").eq("user_id", user_id).execute()
    inventory = inv_res.data or []

    matched = []
    missing = []

    for bom in bom_items:
        desc = (bom.get("description") or "").lower()
        qty_needed = int(bom.get("quantity", 1))

        best = None
        best_score = 0.0
        for inv in inventory:
            inv_desc = (inv.get("description") or "").lower()
            bom_words = set(desc.split())
            inv_words = set(inv_desc.split())
            if not bom_words:
                continue
            score = len(bom_words & inv_words) / len(bom_words)
            if score > best_score and score > 0.3:
                best_score = score
                best = inv

        if best:
            qty_on_hand = int(best.get("quantity_on_hand") or 0)
            matched.append({
                "bom_item": bom,
                "inventory_item": best,
                "match_confidence": round(best_score, 2),
                "quantity_needed": qty_needed,
                "quantity_on_hand": qty_on_hand,
                "sufficient": qty_on_hand >= qty_needed,
            })
        else:
            missing.append({
                "bom_item": bom,
                "quantity_needed": qty_needed,
                "suggested_supplier": "McMaster-Carr",
            })

    return {
        "matched": matched,
        "missing": missing,
        "summary": {
            "total_bom_items": len(bom_items),
            "matched_count": len(matched),
            "missing_count": len(missing),
            "sufficient_count": sum(1 for m in matched if m["sufficient"]),
        },
    }


# ── Shopping List Generator ───────────────────────────────────────────────────

@router.post("/projects/{project_id}/manufacturing/shopping-list")
async def generate_shopping_list(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a shopping list with McMaster-Carr part numbers from the project BOM."""
    from app.core.config import settings

    sb = get_supabase_client()

    bom_res = sb.table("bom_items").select("*").eq("project_id", project_id).execute()
    bom_items = bom_res.data or []

    proj_res = sb.table("projects").select("name,description").eq("id", project_id).single().execute()
    proj = proj_res.data or {}

    if not settings.GEMINI_API_KEY:
        return {
            "items": [
                {
                    "description": b.get("description", "Unknown"),
                    "quantity": b.get("quantity", 1),
                    "mcmaster_pn": "",
                    "estimated_cost": 0.0,
                    "category": "other",
                }
                for b in bom_items
            ],
            "total_hardware_cost": 0.0,
            "suppliers": ["McMaster-Carr", "Misumi"],
            "note": "Gemini API not configured — shopping list generation unavailable.",
        }

    prompt = f"""Given this fixture project BOM, generate a detailed shopping list with real McMaster-Carr part numbers.

Project: {proj.get("name", "Unknown")}
BOM Items:
{json.dumps(bom_items, default=str, indent=2)}

For each BOM item provide:
- description: full part description
- quantity: how many needed
- mcmaster_pn: accurate McMaster-Carr part number (e.g. "91290A228")
- estimated_cost: cost per unit in USD (realistic)
- category: fastener|clamp|pin|raw_material|other

Respond ONLY with valid JSON (no markdown fences):
{{
  "items": [
    {{"description": "...", "quantity": N, "mcmaster_pn": "...", "estimated_cost": N.NN, "category": "..."}}
  ],
  "total_hardware_cost": N.NN,
  "suppliers": ["McMaster-Carr", "Misumi"]
}}"""

    try:
        import asyncio
        import google.generativeai as genai
        model = genai.GenerativeModel(settings.GEMINI_FLASH_MODEL)
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: model.generate_content(prompt))
        raw = resp.text.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1].rsplit("```", 1)[0]
        return json.loads(raw)
    except Exception as e:
        log.error("shopping_list error: %s", e)
        return {
            "items": [
                {
                    "description": b.get("description", "Unknown"),
                    "quantity": b.get("quantity", 1),
                    "mcmaster_pn": "",
                    "estimated_cost": 0.0,
                    "category": "other",
                }
                for b in bom_items
            ],
            "total_hardware_cost": 0.0,
            "suppliers": ["McMaster-Carr", "Misumi"],
            "error": str(e),
        }
