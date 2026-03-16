from fastapi import APIRouter, HTTPException, Depends
from app.models.generation import ExportRequest, ExportResponse, ExportFormat
from app.api.deps import get_current_user_id

router = APIRouter(prefix="/projects", tags=["export"])


@router.post("/{project_id}/export", response_model=ExportResponse)
async def export(
    project_id: str,
    body: ExportRequest,
    user_id: str = Depends(get_current_user_id),
):
    from app.tasks.export import export_task
    job = export_task.apply_async(
        args=[project_id, body.format.value],
        queue="low",
    )
    return ExportResponse(job_id=job.id, status="queued")


@router.get("/{project_id}/export/{job_id}")
async def get_export_status(
    project_id: str,
    job_id: str,
    user_id: str = Depends(get_current_user_id),
):
    from app.core.celery_app import celery_app
    result = celery_app.AsyncResult(job_id)
    download_url = None
    if result.ready() and isinstance(result.result, dict):
        download_url = result.result.get("download_url")
    return {
        "job_id": job_id,
        "status": result.status.lower(),
        "download_url": download_url,
    }
