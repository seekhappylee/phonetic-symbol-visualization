"""Pydantic request/response models for the API."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

Gender = Literal["male", "female"]
Quality = Literal["ok", "low_energy", "too_short", "formant_unreliable"]


class VowelReference(BaseModel):
    id: str
    ipa: str
    example_word: str
    type: str
    f1_mean: Optional[float] = None
    f2_mean: Optional[float] = None
    f3_mean: Optional[float] = None
    f1_sd: Optional[float] = None
    f2_sd: Optional[float] = None
    has_reference: bool = True
    reference_note: Optional[str] = None
    demo_audio: Optional[str] = None
    # Preddemo-analyzed formants of the demonstration recording (if available).
    demo_f1: Optional[float] = None
    demo_f2: Optional[float] = None


class VowelsResponse(BaseModel):
    accent: str
    notation: str
    source: str
    gender: Gender
    unit: str = "Hz"
    vowels: list[VowelReference]


class OverlayVowel(BaseModel):
    """A single vowel centroid from a secondary (display-only) reference dataset.
    SD may be absent (many datasets publish only a central value)."""

    id: str
    f1_mean: Optional[float] = None
    f2_mean: Optional[float] = None
    f1_sd: Optional[float] = None
    f2_sd: Optional[float] = None


class ReferenceOverlay(BaseModel):
    """An extra literature dataset overlaid on the F1-F2 chart for comparison.
    It does NOT drive analysis/scoring (that stays on the primary reference)."""

    id: str
    label: str
    source: str
    note: Optional[str] = None
    statistic: str = "mean"  # e.g. "mean" | "median"
    gender: Gender
    has_data: bool = True
    vowels: list[OverlayVowel] = Field(default_factory=list)


class OverlaysResponse(BaseModel):
    gender: Gender
    overlays: list[ReferenceOverlay] = Field(default_factory=list)


class ReferenceSetVowel(BaseModel):
    """One analyzed vowel inside a user-built reference set (from their own
    uploaded / recorded audio). Audio is stored for playback as a demo."""

    id: str
    f1_mean: Optional[float] = None
    f2_mean: Optional[float] = None
    f3_mean: Optional[float] = None
    start_ms: Optional[float] = None
    end_ms: Optional[float] = None
    steady_start_ms: Optional[float] = None
    steady_end_ms: Optional[float] = None
    quality: Optional[Quality] = None
    has_audio: bool = False


class ReferenceSet(BaseModel):
    """A user-created 'standard' F1/F2 set, selectable later as the comparison
    target (replacing the literature bullseyes) with playable demo audio."""

    id: str
    name: str
    gender: Gender
    created_at: str
    updated_at: str
    vowels: list[ReferenceSetVowel] = Field(default_factory=list)


class ReferenceSetCreate(BaseModel):
    name: str
    gender: Gender


class ReferenceSetPatch(BaseModel):
    name: Optional[str] = None
    gender: Optional[Gender] = None


class ReferenceSetsResponse(BaseModel):
    sets: list[ReferenceSet] = Field(default_factory=list)


class SegmentSpec(BaseModel):
    """A client-supplied analysis region (from the waveform editor). Times in ms
    relative to the start of the recording. steady_* is the sub-window actually
    measured; if omitted the backend picks the central mid-window."""

    start_ms: float
    end_ms: float
    steady_start_ms: Optional[float] = None
    steady_end_ms: Optional[float] = None


class Take(BaseModel):
    """One pass of the target vowel, auto-segmented or explicitly specified."""

    index: int
    f0: Optional[float] = None
    f1: Optional[float] = None
    f2: Optional[float] = None
    f3: Optional[float] = None
    start_ms: float
    end_ms: float
    duration_ms: float
    # The steady-state sub-window actually analyzed (for waveform display).
    steady_start_ms: Optional[float] = None
    steady_end_ms: Optional[float] = None
    quality: Quality
    distance_to_target: Optional[float] = None
    # Human-readable articulatory hint, e.g. "舌位偏后（F2 偏低）".
    hint: Optional[str] = None


class Summary(BaseModel):
    valid_count: int
    f1_center: Optional[float] = None
    f2_center: Optional[float] = None
    f1_spread: Optional[float] = None
    f2_spread: Optional[float] = None
    mean_distance_to_target: Optional[float] = None


class AnalyzeResponse(BaseModel):
    target_vowel_id: Optional[str] = None
    gender: Gender
    takes: list[Take]
    summary: Summary
    warnings: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str
    ffmpeg_available: bool
    parselmouth_version: str
    default_gender: Gender
    reference_loaded: bool
    frontend_served: bool
    notes: list[str] = Field(default_factory=list)
