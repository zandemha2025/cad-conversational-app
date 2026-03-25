from fastapi import APIRouter, HTTPException, status
from app.models.user import UserCreate, UserLogin, UserResponse, TokenResponse
from app.core.database import get_supabase_client, get_supabase_auth
from app.core.security import create_access_token
import logging

router = APIRouter(prefix="/auth", tags=["auth"])
log = logging.getLogger(__name__)


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def register(body: UserCreate):
    """Register via Supabase Admin API — auto-confirms email, accepts any valid email format."""
    # Use the service-role client for admin.create_user (bypasses email domain restrictions)
    sb = get_supabase_client()
    try:
        res = sb.auth.admin.create_user(
            {
                "email": body.email,
                "password": body.password,
                "email_confirm": True,
                "user_metadata": {"full_name": body.full_name or ""},
            }
        )
        user = res.user
        if not user:
            raise HTTPException(status_code=400, detail="Registration failed")
        return UserResponse(
            id=str(user.id),
            email=user.email,
            full_name=body.full_name,
        )
    except HTTPException:
        raise
    except Exception as e:
        log.error("register error: %s", e)
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/login", response_model=TokenResponse)
async def login(body: UserLogin):
    """Sign in via Supabase Auth → returns access token."""
    # Use the ANON-KEY auth client so sign_in_with_password() doesn't contaminate
    # the service-role client's session, which would re-enable RLS on DB queries.
    sb = get_supabase_auth()
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
