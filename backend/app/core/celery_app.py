import os
import ssl
from celery import Celery
from app.core.config import settings

# Filesystem broker dirs must exist before Celery initialises the transport.
# CELERY_BROKER_URL=filesystem:// (set via Fly secret) uses kombu's filesystem
# transport whose default data_folder_in/out is "data_in"/"data_out" relative
# to cwd — which doesn't exist.  Create the canonical path up-front.
_CELERY_FS_DIR = "/tmp/celery-broker"
os.makedirs(_CELERY_FS_DIR, exist_ok=True)

celery_app = Celery(
    "scalecad",
    broker=settings.celery_broker,
    # No result backend — task results are not stored in Redis.
    # This halves Redis usage; tasks are fire-and-forget via pub/sub.
    backend=None,
    include=[
        "app.tasks.process_step",
        "app.tasks.generate_fixture",
        "app.tasks.generate_variations",
        "app.tasks.run_validation",
        "app.tasks.export",
        "app.tasks.proactive_analysis",
        "app.tasks.generate_drawing",
    ],
)

_ssl_opts = {"ssl_cert_reqs": ssl.CERT_NONE} if settings.celery_broker.startswith("rediss://") else {}

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Don't store task results. Also explicitly set result_backend=None here so
    # that the CELERY_RESULT_BACKEND env var (which may contain an invalid
    # "file+filesystem://" URI) cannot override the backend=None constructor arg.
    result_backend=None,
    task_ignore_result=True,
    task_routes={
        "app.tasks.process_step.*":       {"queue": "normal"},
        "app.tasks.generate_fixture.*":    {"queue": "normal"},
        "app.tasks.generate_variations.*": {"queue": "normal"},
        "app.tasks.run_validation.*":      {"queue": "normal"},
        "app.tasks.export.*":             {"queue": "low"},
        "proactive_analysis_task":        {"queue": "low"},
        "app.tasks.generate_drawing.*":   {"queue": "low"},
    },
    task_default_queue="normal",
    # When CELERY_BROKER_URL=filesystem:// the kombu filesystem transport
    # defaults data_folder_in/out to "data_in"/"data_out" (relative cwd).
    # Point both to /tmp/celery-broker which we create at module import time.
    broker_transport_options={
        "data_folder_in": _CELERY_FS_DIR,
        "data_folder_out": _CELERY_FS_DIR,
    },
    **(_ssl_opts and {"broker_use_ssl": _ssl_opts} or {}),
)
