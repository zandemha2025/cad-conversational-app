from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "scalecad",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.process_step",
        "app.tasks.generate_fixture",
        "app.tasks.run_validation",
        "app.tasks.export",
    ],
)

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
        "app.tasks.process_step.*":    {"queue": "normal"},
        "app.tasks.generate_fixture.*": {"queue": "normal"},
        "app.tasks.run_validation.*":  {"queue": "normal"},
        "app.tasks.export.*":          {"queue": "low"},
    },
    task_default_queue="normal",
)
