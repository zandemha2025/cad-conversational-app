FROM python:3.12-slim

# Build deps for pythonocc-core
RUN apt-get update && apt-get install -y --no-install-recommends \
    libglu1-mesa \
    libgl1-mesa-dev \
    libx11-dev \
    libxt-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install all deps except pythonocc-core first (faster layer caching)
COPY requirements.txt .
RUN grep -v 'pythonocc-core' requirements.txt | pip install --no-cache-dir -r /dev/stdin

# pythonocc-core: pre-built wheel available on Linux x86_64 (Fly.io).
# If the wheel is unavailable for this platform, occt_service falls back to stubs.
RUN pip install --no-cache-dir pythonocc-core==7.8.1 \
    || echo "WARN: pythonocc-core wheel not found — OCCT features will use stub fallbacks"

# Copy source
COPY . .

# Expose port
EXPOSE 8000

# Start FastAPI (Fly.io sets $PORT)
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
