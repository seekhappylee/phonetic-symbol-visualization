"""FastAPI entry point: routes + (optional) static frontend hosting."""

from __future__ import annotations

import json

import parselmouth
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from .audio import AudioDecodeError, ffmpeg_available, load_sound
from .config import settings
from .models import (
    AnalyzeResponse,
    Gender,
    HealthResponse,
    SegmentSpec,
    VowelsResponse,
)
from .pipeline import analyze_recording
from .reference import load_reference, vowels_response

app = FastAPI(
    title="English Vowel Trainer API",
    version="0.1.0",
    description="英音（RP）元音发音共振峰分析后端。",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors.allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _resolve_gender(gender: str | None) -> Gender:
    g = (gender or settings.general.default_gender).lower()
    return "female" if g == "female" else "male"


@app.get("/api/health", response_model=HealthResponse)
def health() -> HealthResponse:
    notes: list[str] = []
    has_ffmpeg = ffmpeg_available()
    if not has_ffmpeg:
        notes.append(
            "未检测到 ffmpeg：浏览器 webm/opus 录音将无法转码。"
            "请 `sudo apt install ffmpeg`，或上传 WAV。"
        )
    reference_loaded = True
    try:
        load_reference()
    except Exception as exc:  # noqa: BLE001
        reference_loaded = False
        notes.append(f"参考数据加载失败：{exc}")

    return HealthResponse(
        status="ok" if reference_loaded else "degraded",
        ffmpeg_available=has_ffmpeg,
        parselmouth_version=parselmouth.VERSION,
        default_gender=_resolve_gender(None),
        reference_loaded=reference_loaded,
        frontend_served=settings.frontend_dist_path() is not None,
        notes=notes,
    )


@app.get("/api/vowels", response_model=VowelsResponse)
def get_vowels(
    gender: str | None = Query(default=None, description="male | female"),
) -> VowelsResponse:
    return vowels_response(_resolve_gender(gender))


@app.post("/api/analyze/formants", response_model=AnalyzeResponse)
async def analyze_formants(
    file: UploadFile = File(..., description="一整段录音（可含多遍）"),
    target_vowel_id: str | None = Form(default=None),
    gender: str | None = Form(default=None),
    segments: str | None = Form(
        default=None,
        description="可选 JSON 区段数组；提供则按指定区段分析、跳过自动分遍。",
    ),
) -> AnalyzeResponse:
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="上传的音频为空。")

    explicit = _parse_segments(segments)

    try:
        snd: parselmouth.Sound = load_sound(data, file.filename)
    except AudioDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if snd.get_total_duration() < 0.05:
        raise HTTPException(status_code=422, detail="录音过短，无法分析。")

    return analyze_recording(
        snd,
        gender=_resolve_gender(gender),
        target_vowel_id=target_vowel_id,
        cfg=settings,
        explicit_segments=explicit,
    )


def _parse_segments(raw: str | None) -> list[SegmentSpec] | None:
    if not raw or not raw.strip():
        return None
    try:
        items = json.loads(raw)
        if not isinstance(items, list):
            raise ValueError("segments 必须是数组")
        return [SegmentSpec(**item) for item in items]
    except (json.JSONDecodeError, ValidationError, TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"segments 解析失败：{exc}") from exc


@app.exception_handler(Exception)
async def _unhandled(_request, exc: Exception) -> JSONResponse:  # pragma: no cover
    return JSONResponse(status_code=500, content={"detail": f"分析失败：{exc}"})


# --------------------------------------------------------------------------- #
# Optional: serve a built frontend (single-container form). Mounted LAST so API
# routes take precedence. During split dev this is disabled (frontend_dist empty).
# --------------------------------------------------------------------------- #
_dist = settings.frontend_dist_path()
if _dist is not None and _dist.is_dir():
    app.mount("/", StaticFiles(directory=str(_dist), html=True), name="frontend")
