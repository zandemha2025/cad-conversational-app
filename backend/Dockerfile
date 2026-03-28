FROM python:3.11-slim

# System deps for CadQuery/OCP (OpenGL, OpenMP) and other native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglu1-mesa \
    libgl1-mesa-glx \
    libgomp1 \
    libfontconfig1 \
    libfreetype6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# ── Step 1: pre-fetch cadquery-ocp (the large ~400 MB OCP wheel) ──────────────
# cadquery 2.5.2 depends on cadquery-ocp (not the old "OCP" package).
# Installing it separately first with a long timeout prevents the main install
# from timing out on slow build-VM networks (Fly.io remote builders).
RUN pip install --no-cache-dir --timeout=600 --prefer-binary \
    "cadquery-ocp>=7.7.2,<7.8"

# ── Step 2: install cadquery (cadquery-ocp already cached → fast) ─────────────
RUN pip install --no-cache-dir --timeout=120 cadquery==2.5.2

# ── Step 3: hard verification — FAIL the build if cadquery can't import ───────
# This makes the failure visible at build time instead of silently producing
# a container that falls back to Zoo.dev on every request.
RUN python -c "import cadquery; print('CadQuery', cadquery.__version__, 'OK')"

# ── Step 4: install remaining Python deps (cadquery already satisfied above) ──
RUN grep -v -E '^(pythonocc-core|cadquery)==' requirements.txt \
    | pip install --no-cache-dir --prefer-binary -r /dev/stdin

# ── Step 5: pythonocc-core (OCCT export/drawing features — best-effort) ───────
RUN pip install --no-cache-dir pythonocc-core==7.8.1 \
    || echo "WARN: pythonocc-core wheel not found — OCCT features will use stub fallbacks"

COPY . .

EXPOSE 8000

# Start Celery worker in background, then FastAPI in foreground (Fly.io sets $PORT)
CMD ["sh", "-c", "celery -A app.core.celery_app.celery_app worker --loglevel=info -Q normal,low --concurrency=2 & uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
