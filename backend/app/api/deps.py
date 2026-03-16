"""
FastAPI dependency injection helpers.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.security import verify_supabase_jwt, verify_token
from app.core.database import get_db_session
from sqlalchemy.ext.asyncio import AsyncSession

bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    """
    Validates the Bearer JWT (Supabase-issued or our own).
    Returns the decoded payload dict with at minimum: { "sub": <user_id> }
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials

    # Try Supabase JWT first (production), then our own (testing)
    payload = verify_supabase_jwt(token) or verify_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return payload


async def get_current_user_id(
    payload: dict = Depends(get_current_user),
) -> str:
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bad token payload")
    return user_id


# Re-export DB session dep for convenience
async def get_db(session: AsyncSession = Depends(get_db_session)):
    yield session
