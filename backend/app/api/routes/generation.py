"""
Generation progress WebSocket + REST polling.

WS URL: /api/projects/{project_id}/generation
The Celery worker pushes events; this endpoint relays them to the browser.
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException, Depends
from app.api.deps import get_current_user_id
from app.core.security import verify_supabase_jwt, verify_token
from app.core.config import settings
import redis.asyncio as aioredis

router = APIRouter(tags=["generation"])
log = logging.getLogger(__name__)


@router.websocket("/projects/{project_id}/generation")
async def generation_ws(websocket: WebSocket, project_id: str):
    """
    Subscribes to a Redis pub/sub channel that the Celery task publishes to.
    Channel name: scalecad:gen:{project_id}
    """
    await websocket.accept()

    # Auth
    raw = await websocket.receive_text()
    msg = json.loads(raw)
    token = msg.get("token", "")
    payload = verify_supabase_jwt(token) or verify_token(token)
    if not payload:
        await websocket.send_json({"type": "error", "detail": "Invalid token"})
        await websocket.close(code=1008)
        return

    await websocket.send_json({"type": "auth_ok"})

    try:
        redis = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
        pubsub = redis.pubsub()
        channel = f"scalecad:gen:{project_id}"
        await pubsub.subscribe(channel)
    except Exception as redis_exc:
        log.warning("Redis unavailable for generation WS project=%s: %s", project_id, redis_exc)
        try:
            await websocket.send_json({
                "status": "generating",
                "message": "Generation started (real-time updates unavailable — check back in a moment).",
                "progress": 0.05,
            })
        except Exception:
            pass
        await websocket.close(code=1000)
        return

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    data = json.loads(message["data"])
                except (json.JSONDecodeError, TypeError) as e:
                    log.warning("Malformed Redis message on %s: %s", channel, e)
                    continue
                await websocket.send_json(data)
                if data.get("status") in ("done", "done_with_warnings", "error"):
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        log.error("Generation WS error project=%s: %s", project_id, e)
        try:
            await websocket.send_json({"status": "error", "message": "Connection error"})
        except Exception:
            pass
    finally:
        try:
            await pubsub.unsubscribe(channel)
            await redis.aclose()
        except Exception:
            pass


@router.get("/projects/{project_id}/generation/jobs/{job_id}")
async def get_job_status(
    project_id: str,
    job_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """REST polling fallback for environments without WS support."""
    from app.core.celery_app import celery_app
    result = celery_app.AsyncResult(job_id)
    return {
        "job_id": job_id,
        "status": result.status.lower(),
        "result": result.result if result.ready() else None,
    }
