from datetime import datetime, timedelta, timezone
from typing import Any
from jose import JWTError, jwt
from passlib.context import CryptContext
from app.core.config import settings
import logging

log = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# ---------------------------------------------------------------------------
# Supabase JWKS — cached in-memory (refreshed on decode error)
# ---------------------------------------------------------------------------
_supabase_jwks: list[dict] | None = None


def _fetch_supabase_jwks() -> list[dict]:
    """Fetch Supabase's public JWKS (ES256 keys)."""
    import urllib.request, json as _json
    url = f"{settings.SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    with urllib.request.urlopen(url, timeout=5) as r:
        return _json.loads(r.read())["keys"]


def _get_supabase_jwks() -> list[dict]:
    global _supabase_jwks
    if _supabase_jwks is None:
        try:
            _supabase_jwks = _fetch_supabase_jwks()
        except Exception as e:
            log.warning("Could not fetch Supabase JWKS: %s", e)
            _supabase_jwks = []
    return _supabase_jwks


def verify_supabase_jwt(token: str) -> dict | None:
    """Verify a Supabase-issued JWT.

    Modern Supabase uses ES256 (P-256) signed tokens distributed via JWKS.
    Falls back to HS256 with SUPABASE_JWT_SECRET for older/legacy projects.
    """
    global _supabase_jwks

    # --- ES256 via JWKS (new Supabase default) ---
    keys = _get_supabase_jwks()
    for key_data in keys:
        try:
            from jose.backends import ECKey
            payload = jwt.decode(
                token,
                key_data,
                algorithms=["ES256"],
                options={"verify_aud": False},
            )
            return payload
        except JWTError:
            continue
        except Exception:
            continue

    # If JWKS decode failed, maybe the key cache is stale — refresh once.
    if keys:
        try:
            _supabase_jwks = _fetch_supabase_jwks()
            for key_data in _supabase_jwks:
                try:
                    payload = jwt.decode(
                        token,
                        key_data,
                        algorithms=["ES256"],
                        options={"verify_aud": False},
                    )
                    return payload
                except Exception:
                    continue
        except Exception as e:
            log.warning("JWKS refresh failed: %s", e)

    # --- HS256 fallback (legacy Supabase) ---
    if settings.SUPABASE_JWT_SECRET:
        try:
            payload = jwt.decode(
                token,
                settings.SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
            return payload
        except JWTError:
            pass

    return None


def create_access_token(subject: str | Any, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    payload = {"sub": str(subject), "exp": expire, "iat": datetime.now(timezone.utc)}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        return payload
    except JWTError:
        return None


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


# Alias used in deps.py
verify_token = decode_access_token
