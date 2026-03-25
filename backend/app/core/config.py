from pydantic_settings import BaseSettings
from pydantic import field_validator, computed_field
from functools import lru_cache


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────────────────────────
    APP_NAME: str = "ScaleCAD API"
    APP_VERSION: str = "0.1.0"
    ENVIRONMENT: str = "development"
    SECRET_KEY: str = "change-me-in-production"
    DEBUG: bool = True

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:5174,https://scalecad.app,https://www.scalecad.app,https://eager-euler.vercel.app"

    @computed_field
    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    # ── Supabase ──────────────────────────────────────────────────────────────
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""          # service role key (backend only)
    SUPABASE_ANON_KEY: str = ""             # anon key (for frontend)
    SUPABASE_JWT_SECRET: str = ""           # JWT secret (Project Settings → API → JWT Settings)
    DATABASE_URL: str = ""                  # postgresql://... (auto-converted to asyncpg)

    @field_validator("DATABASE_URL", mode="before")
    @classmethod
    def fix_database_url(cls, v):
        if isinstance(v, str) and v.startswith("postgresql://"):
            return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    # ── Cloudflare R2 (S3-compatible) ─────────────────────────────────────────
    R2_ACCOUNT_ID: str = ""
    R2_ACCESS_KEY: str = ""
    R2_SECRET_KEY: str = ""
    R2_BUCKET: str = "scalecad-files"
    R2_PUBLIC_URL: str = "https://files.scalecad.app"
    R2_ENDPOINT_URL: str = ""               # https://<account_id>.r2.cloudflarestorage.com

    # ── AI — Google Gemini ────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_FLASH_MODEL: str = "gemini-2.5-flash"
    GEMINI_PRO_MODEL: str = "gemini-2.5-flash"

    # ── Zoo.dev CAD Kernel ────────────────────────────────────────────────────
    ZOO_API_KEY: str = ""
    ZOO_API_URL: str = "https://api.zoo.dev"

    # ── Redis / Celery ────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    # If separate Celery URLs are not configured, derive from REDIS_URL
    CELERY_BROKER_URL: str = ""
    CELERY_RESULT_BACKEND: str = ""

    @computed_field
    @property
    def celery_broker(self) -> str:
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @computed_field
    @property
    def celery_backend(self) -> str:
        return self.CELERY_RESULT_BACKEND or self.REDIS_URL

    # ── JWT ───────────────────────────────────────────────────────────────────
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7   # 7 days
    JWT_ALGORITHM: str = "HS256"

    # ── Upload limits ─────────────────────────────────────────────────────────
    MAX_STEP_FILE_SIZE_MB: int = 50
    MAX_STEP_FILE_SIZE_BYTES: int = 50 * 1024 * 1024

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = True


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
