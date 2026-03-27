"""
Cloudflare R2 (S3-compatible) storage.
All functions are synchronous — safe for both FastAPI and Celery workers.
"""
import boto3
import mimetypes
import logging
from botocore.config import Config
from botocore.exceptions import ClientError
from app.core.config import settings

log = logging.getLogger(__name__)


def _client():
    if not settings.R2_ACCESS_KEY:
        return None
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL
            or f"https://{settings.R2_ACCOUNT_ID}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.R2_ACCESS_KEY,
        aws_secret_access_key=settings.R2_SECRET_KEY,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


def _upload(key: str, data: bytes, content_type: str = "application/octet-stream") -> str | None:
    """Upload bytes to R2. Returns public URL, or None if R2 is not configured."""
    client = _client()
    if client is None:
        log.error("R2 not configured — cannot upload %s (set R2_ACCESS_KEY, R2_SECRET_KEY, R2_ACCOUNT_ID)", key)
        return None
    client.put_object(Bucket=settings.R2_BUCKET, Key=key, Body=data, ContentType=content_type)
    return f"{settings.R2_PUBLIC_URL}/{key}"


def upload_step_file(project_id: str, filename: str, data: bytes) -> str | None:
    key = f"projects/{project_id}/step/{filename}"
    return _upload(key, data, "application/octet-stream")


def upload_gltf(project_id: str, filename: str, data: bytes) -> str | None:
    key = f"projects/{project_id}/gltf/{filename}"
    return _upload(key, data, "model/gltf-binary")


def upload_export(project_id: str, filename: str, data: bytes, fmt: str) -> str | None:
    ct_map = {
        "step": "application/octet-stream",
        "stl":  "model/stl",
        "3mf":  "model/3mf",
        "pdf":  "application/pdf",
    }
    key = f"projects/{project_id}/exports/{filename}"
    return _upload(key, data, ct_map.get(fmt, "application/octet-stream"))


def get_signed_download_url(key: str, expires_in: int = 3600) -> str | None:
    client = _client()
    if client is None:
        log.error("R2 not configured — cannot generate signed URL for %s", key)
        return None
    try:
        return client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.R2_BUCKET, "Key": key},
            ExpiresIn=expires_in,
        )
    except ClientError as e:
        log.error("generate_presigned_url failed for %s: %s", key, e)
        raise
