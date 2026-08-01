# Multi-stage build: build the frontend, then serve everything from one Python
# container (FastAPI hosts the built dist + the API on the same origin).
# Build context is the repository root:  docker build -f docker/Dockerfile .

# --------------------------------------------------------------------------- #
# Stage 1: build the frontend (Vite -> static dist).
# VITE_API_BASE is baked at build time; empty means "same origin" (/api/...).
# --------------------------------------------------------------------------- #
FROM node:22-slim AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
ENV VITE_API_BASE=""
RUN npm run build

# --------------------------------------------------------------------------- #
# Stage 2: runtime. Python + ffmpeg + uv-installed deps + the built frontend.
# --------------------------------------------------------------------------- #
FROM python:3.12-slim AS runtime

# ffmpeg is a hard system dependency (webm/opus -> wav transcode).
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# uv for reproducible dependency install from uv.lock.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app/backend

# Install dependencies first (cache layer) using the lockfile only.
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# App code + reference data.
COPY backend/app ./app

# Built frontend from stage 1; FastAPI serves it (single-container form).
COPY --from=frontend /build/dist /app/frontend/dist

ENV VOWEL_TRAINER_GENERAL_FRONTEND_DIST=/app/frontend/dist \
    VOWEL_TRAINER_CORS_ALLOW_ORIGINS="" \
    PYTHONUNBUFFERED=1

EXPOSE 8000

# uv run activates the locked venv. Single worker keeps parselmouth memory low;
# scale with --workers or a process manager if needed.
CMD ["uv", "run", "--frozen", "--no-dev", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", "--port", "8000"]
