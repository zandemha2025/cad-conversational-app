FROM python:3.11-slim

# Build deps for pythonocc-core
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglu1-mesa \
    libgl1-mesa-dev \
    libx11-dev \
    libxt-dev \
    libxrender1 \
    libxext6 \
    libgomp1 \
    libfontconfig1 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all deps except pythonocc-core first (faster layer caching)
COPY requirements.txt .
RUN grep -v -E '^(pythonocc-core|cadquery)==' requirements.txt | pip install --no-cache-dir -r /dev/stdin

# pythonocc-core: pre-built wheel available on Linux x86_64 (Fly.io).
# If the wheel is unavailable for this platform, occt_service falls back to stubs.
RUN pip install --no-cache-dir pythonocc-core==7.8.1 \
    || echo "WARN: pythonocc-core wheel not found — OCCT features will use stub fallbacks"

# CadQuery: local Python CAD kernel for precise parametric parts.
# Requires Python ≤3.11 for official pre-built wheels; on 3.12 try cadquery-ocp.
# cadquery_service falls back to Zoo.dev automatically if import fails.
RUN pip install --no-cache-dir cadquery==2.4.0 \
    || { pip install --no-cache-dir cadquery-ocp && pip install --no-cache-dir cadquery==2.4.0; } \
    || echo "WARN: cadquery not available — CadQuery engine will fall back to Zoo.dev"

# Copy source
COPY . .

# Expose port
EXPOSE 8000

# Start Celery worker in background, then FastAPI in foreground (Fly.io sets $PORT)
CMD ["sh", "-c", "celery -A app.core.celery_app.celery_app worker --loglevel=info -Q normal,low --concurrency=2 & uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
