#!/bin/sh
# Start Celery worker in background, then uvicorn in foreground
celery -A app.core.celery_app worker --loglevel=info -Q normal,low --concurrency=2 &
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
