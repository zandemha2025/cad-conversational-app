"""
ScaleCAD FastAPI application entry point.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
)

# ── CORS ───────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
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
