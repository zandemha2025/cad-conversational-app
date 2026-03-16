"""
Audit log middleware — auto-logs all non-GET requests.
"""
import uuid
import json
import logging
from datetime import datetime, timezone
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

log = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Only log mutating requests that succeed
        if request.method in ("POST", "PATCH", "PUT", "DELETE") and response.status_code < 400:
            try:
                # Extract user_id from request state (set by auth middleware)
                user_id = getattr(request.state, "user_id", None)
                if user_id:
                    path_parts = request.url.path.strip("/").split("/")
                    resource_type = path_parts[1] if len(path_parts) > 1 else "unknown"
                    resource_id = path_parts[2] if len(path_parts) > 2 else None

                    action = f"{resource_type}.{request.method.lower()}"

                    # Log to DB asynchronously
                    from app.core.database import async_session_factory
                    from sqlalchemy import text
                    async with async_session_factory() as db:
                        await db.execute(
                            text("""
                                INSERT INTO audit_log
                                  (id, user_id, action, resource_type, resource_id, ip_address, created_at)
                                VALUES
                                  (:id, :uid, :action, :rtype, :rid, :ip, :now)
                            """),
                            {
                                "id": str(uuid.uuid4()),
                                "uid": str(user_id),
                                "action": action,
                                "rtype": resource_type,
                                "rid": resource_id,
                                "ip": request.client.host if request.client else None,
                                "now": datetime.now(timezone.utc).isoformat(),
                            },
                        )
                        await db.commit()
            except Exception as e:
                log.debug("Audit log failed (non-critical): %s", e)

        return response
