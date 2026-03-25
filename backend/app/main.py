"""
ScaleCAD FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
import logging

_mig_log = logging.getLogger(__name__)

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
    redirect_slashes=False,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────────
from app.api.routes import (
    auth, projects, upload, geometry,
    touchpoints, validation, nodes,
    chat, generation, export, bom,
)
# New routers (Sprint 2–4)
from app.api.routes.hardware import router as hardware_router
from app.api.routes.revisions import router as revisions_router
from app.api.routes.organizations import router as orgs_router
from app.api.routes.drawings import router as drawings_router
from app.api.routes.analytics import router as analytics_router
from app.api.routes.audit_log import router as audit_router
from app.api.routes.fea_lite import router as fea_lite_router
# New manufacturing features (Sprint 5)
from app.api.routes.approvals import router as approvals_router
from app.api.routes.constraints import router as constraints_router
from app.api.routes.interference import router as interference_router
from app.api.routes.clamping_force import router as clamping_force_router
from app.api.routes.export_direct import router as export_direct_router
from app.api.routes.revisions_v2 import router as revisions_v2_router
from app.api.routes.drawings_v2 import router as drawings_v2_router
# Manufacturing docs + materials library (Sprint 6)
from app.api.routes.work_instructions import router as work_instructions_router
from app.api.routes.qc_checklist import router as qc_checklist_router
from app.api.routes.materials import router as materials_router
from app.api.routes.tolerance_stack import router as tolerance_stack_router
# Assembly support (Feature 5)
from app.api.routes.assembly import router as assembly_router

API = "/api"

app.include_router(auth.router,        prefix=API)
app.include_router(projects.router,    prefix=API)
app.include_router(upload.router,      prefix=API)
app.include_router(geometry.router,    prefix=API)
app.include_router(touchpoints.router, prefix=API)
app.include_router(validation.router,  prefix=API)
app.include_router(nodes.router,       prefix=API)
app.include_router(chat.router,        prefix=API)
app.include_router(generation.router,  prefix=API)
app.include_router(export_direct_router,  prefix=API)   # must precede export.router (same URL pattern)
app.include_router(export.router,      prefix=API)
app.include_router(bom.router,         prefix=API)
# New
app.include_router(hardware_router)
app.include_router(revisions_router)
app.include_router(orgs_router)
app.include_router(drawings_router)
app.include_router(analytics_router)
app.include_router(audit_router)
app.include_router(fea_lite_router, prefix=API)
# Manufacturing features (Sprint 5)
app.include_router(approvals_router,      prefix=API)
app.include_router(constraints_router,    prefix=API)
app.include_router(interference_router,   prefix=API)
app.include_router(clamping_force_router, prefix=API)
app.include_router(revisions_v2_router,       prefix=API)
app.include_router(drawings_v2_router,        prefix=API)
# Manufacturing docs + materials library (Sprint 6)
app.include_router(work_instructions_router,  prefix=API)
app.include_router(qc_checklist_router,       prefix=API)
app.include_router(materials_router,          prefix=API)  # public, no auth
app.include_router(tolerance_stack_router,    prefix=API)
# Assembly support (Feature 5)
app.include_router(assembly_router,           prefix=API)


# ── Startup migrations ────────────────────────────────────────────────────────
@app.on_event("startup")
async def run_migrations():
    """Run idempotent DDL migrations on startup."""
    db_url = settings.DATABASE_URL
    if not db_url:
        _mig_log.warning("DATABASE_URL not set — skipping startup migrations")
        return
    try:
        from sqlalchemy.ext.asyncio import create_async_engine
        from sqlalchemy import text
        # Ensure URL uses asyncpg driver and has SSL for Supabase pooler
        if db_url.startswith("postgresql://") and "asyncpg" not in db_url:
            db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        engine = create_async_engine(
            db_url,
            pool_pre_ping=True,
            connect_args={"ssl": "require"} if "supabase.com" in db_url else {},
        )
        async with engine.begin() as conn:
            await conn.execute(text("""
                CREATE TABLE IF NOT EXISTS assembly_components (
                  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                  fixture_id UUID REFERENCES fixture_geometries(id) ON DELETE CASCADE,
                  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
                  name TEXT NOT NULL,
                  component_type TEXT,
                  description TEXT,
                  gltf_url TEXT,
                  position_json JSONB,
                  rotation_json JSONB,
                  material TEXT,
                  created_at TIMESTAMPTZ DEFAULT now()
                )
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_assembly_components_project_id
                ON assembly_components(project_id)
            """))
            await conn.execute(text("""
                CREATE INDEX IF NOT EXISTS idx_assembly_components_fixture_id
                ON assembly_components(fixture_id)
            """))
        await engine.dispose()
        _mig_log.info("Startup migrations complete")
    except Exception as e:
        _mig_log.error("Startup migration failed: %s", e)


# ── Startup validation ────────────────────────────────────────────────────────
@app.on_event("startup")
async def validate_config():
    missing = []
    if not settings.SUPABASE_URL:
        missing.append("SUPABASE_URL")
    if not settings.SUPABASE_SERVICE_KEY:
        missing.append("SUPABASE_SERVICE_KEY")
    if not settings.SUPABASE_JWT_SECRET:
        missing.append("SUPABASE_JWT_SECRET")
    if missing:
        import logging
        logging.getLogger(__name__).warning(
            "Missing env vars (auth will fail): %s", ", ".join(missing)
        )
    if not settings.GEMINI_API_KEY:
        import logging
        logging.getLogger(__name__).warning(
            "GEMINI_API_KEY not set — AI features will use stub responses"
        )


# ── Health check ───────────────────────────────────────────────────────────────
@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
    }


# ── Root ───────────────────────────────────────────────────────────────────────
@app.get("/")
async def root():
    return {"message": f"{settings.APP_NAME} v{settings.APP_VERSION}"}
