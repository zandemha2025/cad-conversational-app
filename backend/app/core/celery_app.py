import ssl
from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "scalecad",
    broker=settings.celery_broker,
    backend=settings.celery_backend,
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
    **(_ssl_opts and {"broker_use_ssl": _ssl_opts, "redis_backend_use_ssl": _ssl_opts} or {}),
)
