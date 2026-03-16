from supabase import create_client, Client
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)


# ── Supabase client (for auth + simple queries) ───────────────────────────────

_supabase_client: Client | None = None


def get_supabase() -> Client:
    global _supabase_client
    if _supabase_client is None:
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_KEY:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set")
        _supabase_client = create_client(
            settings.SUPABASE_URL,
            settings.SUPABASE_SERVICE_KEY,
        )
    return _supabase_client


# ── SQLAlchemy async engine (for complex queries) ─────────────────────────────

class Base(DeclarativeBase):
    pass


_engine = None
_async_session_factory = None


def get_engine():
    global _engine
    if _engine is None and settings.DATABASE_URL:
        _engine = create_async_engine(
            settings.DATABASE_URL,
            echo=settings.DEBUG,
            pool_size=10,
            max_overflow=20,
        )
    return _engine


def get_session_factory():
    global _async_session_factory
    if _async_session_factory is None:
        engine = get_engine()
        if engine:
            _async_session_factory = async_sessionmaker(
                engine,
                class_=AsyncSession,
                expire_on_commit=False,
            )
    return _async_session_factory


# Aliases used across routes and tasks
get_supabase_client = get_supabase
async_session_factory = get_session_factory


async def get_db() -> AsyncSession:  # noqa: D401
    """FastAPI dependency — yields an async SQLAlchemy session."""
    factory = get_session_factory()
    if factory is None:
        raise RuntimeError("DATABASE_URL not configured")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def get_db_session() -> AsyncSession:
    factory = get_session_factory()
    if factory is None:
        raise RuntimeError("DATABASE_URL not configured")
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
