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


class Take(BaseModel):
    """One pass of the target vowel, auto-segmented from the recording."""

    index: int
    f0: Optional[float] = None
    f1: Optional[float] = None
    f2: Optional[float] = None
    f3: Optional[float] = None
    start_ms: float
    end_ms: float
    duration_ms: float
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
