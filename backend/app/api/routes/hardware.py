"""
Hardware catalog routes.
GET /api/hardware/catalog — search catalog
GET /api/hardware/{id}
POST /api/hardware/bom/{project_id}/add
"""
from fastapi import APIRouter, Depends, Query
from app.api.deps import get_current_user
from app.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api/hardware", tags=["hardware"])


@router.get("/catalog")
async def search_catalog(
    q: str = Query("", description="Full-text search"),
    category: str = Query("", description="Filter by category"),
    supplier: str = Query("", description="Filter by supplier"),
    limit: int = Query(50, le=200),
    _user=Depends(get_current_user),
):
    """Search hardware catalog with optional filters."""
    from app.core.database import get_supabase_client
    try:
        sb = get_supabase_client()
        query = sb.table("hardware_catalog").select(
            "id,part_number,name,category,supplier,specs_json,price_usd,in_stock,preferred"
        ).order("preferred", desc=True).order("name").limit(limit)
        if category:
            query = query.eq("category", category)
        if supplier:
            query = query.ilike("supplier", f"%{supplier}%")
        res = query.execute()
        rows = res.data or []
        if q:
            q_lower = q.lower()
            rows = [r for r in rows if q_lower in (r.get("name") or "").lower() or q_lower in (r.get("part_number") or "").lower()]
        return rows
    except Exception as e:
        log.error("hardware catalog error: %s", e)
        return []


@router.get("/{hardware_id}")
async def get_hardware_item(
    hardware_id: str,
    db: AsyncSession = Depends(get_db),
    _user=Depends(get_current_user),
):
    result = await db.execute(
        text("SELECT * FROM hardware_catalog WHERE id = :id"),
        {"id": hardware_id},
    )
    row = result.mappings().first()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(404, "Hardware item not found")
    return dict(row)


@router.post("/bom/{project_id}/add")
async def add_hardware_to_bom(
    project_id: str,
    body: dict,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Add a hardware catalog item to a project's BOM."""
    hardware_id = body.get("hardware_id")
    quantity = body.get("quantity", 1)

    # Fetch hardware item
    result = await db.execute(
        text("SELECT * FROM hardware_catalog WHERE id = :id"),
        {"id": hardware_id},
    )
    item = result.mappings().first()
    if not item:
        from fastapi import HTTPException
        raise HTTPException(404, "Hardware item not found")

    # Get next item_no
    count_result = await db.execute(
        text("SELECT COUNT(*) FROM bom_items WHERE project_id = :pid"),
        {"pid": project_id},
    )
    item_no = (count_result.scalar() or 0) + 1

    await db.execute(
        text("""
            INSERT INTO bom_items (project_id, item_no, part_number, description, quantity)
            VALUES (:pid, :item_no, :pn, :desc, :qty)
        """),
        {"pid": project_id, "item_no": item_no, "pn": item["part_number"], "desc": item["name"], "qty": quantity},
    )
    await db.commit()
    return {"ok": True, "item_no": item_no}
