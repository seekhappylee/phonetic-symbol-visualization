"""FastAPI entry point: routes + (optional) static frontend hosting."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path

import parselmouth
from fastapi import Body, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from . import reference_sets as rsets
from .audio import AudioDecodeError, ffmpeg_available, load_sound
from .config import settings
from .models import (
    AnalyzeResponse,
    Gender,
    HealthResponse,
    OverlaysResponse,
    ReferenceSet,
    ReferenceSetCreate,
    ReferenceSetPatch,
    ReferenceSetsResponse,
    ReferenceSetVowel,
    SegmentSpec,
    VowelsResponse,
)
from .pipeline import analyze_recording
from .reference import load_reference, overlays_response, vowels_response

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


@app.get("/api/reference-overlays", response_model=OverlaysResponse)
def get_reference_overlays(
    gender: str | None = Query(default=None, description="male | female"),
) -> OverlaysResponse:
    """Secondary literature datasets for chart comparison (display-only). Empty
    list when no overlay files are present. Never affects analysis/scoring."""
    return overlays_response(_resolve_gender(gender))


@app.post("/api/analyze/formants", response_model=AnalyzeResponse)
async def analyze_formants(
    file: UploadFile = File(..., description="一整段录音（可含多遍）"),
    target_vowel_id: str | None = Form(default=None),
    gender: str | None = Form(default=None),
    reference_set_id: str | None = Form(
        default=None,
        description="可选：以某个用户标准音库作为对比靶心（替代文献靶心）。",
    ),
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

    reference_target = (
        rsets.target_for_set(reference_set_id, target_vowel_id)
        if reference_set_id
        else None
    )

    return analyze_recording(
        snd,
        gender=_resolve_gender(gender),
        target_vowel_id=target_vowel_id,
        cfg=settings,
        explicit_segments=explicit,
        reference_target=reference_target,
        scope_to_reference=bool(reference_set_id),
    )


# --------------------------------------------------------------------------- #
# User-built reference sets ("standard" F1/F2 sets from the learner's own audio).
# --------------------------------------------------------------------------- #

@app.get("/api/reference-sets", response_model=ReferenceSetsResponse)
def list_reference_sets() -> ReferenceSetsResponse:
    return ReferenceSetsResponse(sets=rsets.list_sets())


@app.post("/api/reference-sets", response_model=ReferenceSet)
def create_reference_set(body: ReferenceSetCreate) -> ReferenceSet:
    return rsets.create_set(body.name, _resolve_gender(body.gender))


@app.get("/api/reference-sets/{set_id}", response_model=ReferenceSet)
def get_reference_set(set_id: str) -> ReferenceSet:
    try:
        return rsets.get_set(set_id)
    except rsets.ReferenceSetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/api/reference-sets/{set_id}", response_model=ReferenceSet)
def patch_reference_set(set_id: str, body: ReferenceSetPatch) -> ReferenceSet:
    try:
        gender = _resolve_gender(body.gender) if body.gender else None
        return rsets.patch_set(set_id, body.name, gender)
    except rsets.ReferenceSetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.delete("/api/reference-sets/{set_id}")
def delete_reference_set(set_id: str) -> dict:
    try:
        rsets.delete_set(set_id)
    except rsets.ReferenceSetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"deleted": set_id}


@app.put("/api/reference-sets/{set_id}/vowels/{vowel_id}", response_model=ReferenceSet)
async def put_reference_set_vowel(
    set_id: str,
    vowel_id: str,
    file: UploadFile = File(..., description="该元音的一段音频"),
    gender: str | None = Form(default=None),
    segments: str | None = Form(default=None),
) -> ReferenceSet:
    try:
        rs = rsets.get_set(set_id)
    except rsets.ReferenceSetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="上传的音频为空。")
    try:
        snd = load_sound(data, file.filename)
    except AudioDecodeError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if snd.get_total_duration() < 0.05:
        raise HTTPException(status_code=422, detail="音频过短，无法分析。")

    g = _resolve_gender(gender or rs.gender)
    vowel, wav = _analyze_clip_for_set(snd, vowel_id, g, _parse_segments(segments))
    return rsets.upsert_vowel(set_id, vowel, wav)


@app.delete("/api/reference-sets/{set_id}/vowels/{vowel_id}", response_model=ReferenceSet)
def delete_reference_set_vowel(set_id: str, vowel_id: str) -> ReferenceSet:
    try:
        return rsets.delete_vowel(set_id, vowel_id)
    except rsets.ReferenceSetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/reference-sets/{set_id}/audio/{vowel_id}")
def get_reference_set_audio(set_id: str, vowel_id: str) -> FileResponse:
    try:
        path = rsets.audio_path(set_id, vowel_id)
    except rsets.ReferenceSetError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    if path is None:
        raise HTTPException(status_code=404, detail="该元音暂无示范音。")
    return FileResponse(str(path), media_type="audio/wav")


def _analyze_clip_for_set(
    snd: parselmouth.Sound,
    vowel_id: str,
    gender: Gender,
    explicit: list[SegmentSpec] | None,
) -> tuple[ReferenceSetVowel, bytes]:
    """Analyze one vowel clip into a representative F1/F2 point and normalized
    WAV bytes (for demo playback). Uses the same pipeline as practice; the
    representative point is the mean over ok takes (robust to a stray take)."""
    resp = analyze_recording(
        snd,
        gender=gender,
        target_vowel_id=None,
        cfg=settings,
        explicit_segments=explicit,
    )
    ok = [t for t in resp.takes if t.quality == "ok" and t.f1 is not None]
    if ok and resp.summary.valid_count > 0:
        first = ok[0]
        vowel = ReferenceSetVowel(
            id=vowel_id,
            f1_mean=resp.summary.f1_center,
            f2_mean=resp.summary.f2_center,
            f3_mean=first.f3,
            start_ms=first.start_ms,
            end_ms=first.end_ms,
            steady_start_ms=first.steady_start_ms,
            steady_end_ms=first.steady_end_ms,
            quality="ok",
        )
    else:
        first = resp.takes[0] if resp.takes else None
        vowel = ReferenceSetVowel(
            id=vowel_id,
            quality=(first.quality if first else "formant_unreliable"),
            start_ms=(first.start_ms if first else None),
            end_ms=(first.end_ms if first else None),
            steady_start_ms=(first.steady_start_ms if first else None),
            steady_end_ms=(first.steady_end_ms if first else None),
        )
    return vowel, _sound_to_wav_bytes(snd)


def _sound_to_wav_bytes(snd: parselmouth.Sound) -> bytes:
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp) / "clip.wav"
        snd.save(str(wav), "WAV")
        return wav.read_bytes()


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
