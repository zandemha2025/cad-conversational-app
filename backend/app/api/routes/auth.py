from fastapi import APIRouter, HTTPException, status
from app.models.user import UserCreate, UserLogin, UserResponse, TokenResponse
from app.core.database import get_supabase_client
from app.core.security import create_access_token
import logging

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger(__name__)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate):
    """Register with Supabase Auth."""
    sb = get_supabase_client()
    try:
        res = sb.auth.sign_up({"email": body.email, "password": body.password})
        user = res.user
        if not user:
            raise HTTPException(status_code=400, detail="Registration failed")
        return UserResponse(
            id=str(user.id),
            email=user.email,
            full_name=body.full_name,
        )
    except Exception as e:
        log.error("register error: %s", e)
        raise HTTPException(status_code=400, detail="Registration failed")


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """Sign in via Supabase Auth → returns access token."""
    sb = get_supabase_client()
    try:
        res = sb.auth.sign_in_with_password({"email": body.email, "password": body.password})
        session = res.session
        user = res.user
        if not session or not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return TokenResponse(
            access_token=session.access_token,
            token_type="bearer",
            user=UserResponse(
                id=str(user.id),
                email=user.email,
                full_name=user.user_metadata.get("full_name") if user.user_metadata else None,
            ),
        )
    except HTTPException:
        raise
    except Exception as e:
        log.error("login error: %s", e)
        raise HTTPException(status_code=401, detail="Invalid credentials")


@router.post("/logout")
async def logout():
    """Client should discard the token. Supabase tokens are stateless JWTs."""
    return {"message": "Logged out"}
