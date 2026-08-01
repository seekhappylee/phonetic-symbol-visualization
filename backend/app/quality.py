"""Per-take formant quality control (dev doc §6.5, note 7).

Checks each frame for formant plausibility (F1 < F2 < F3 and each within a
physiological range) and derives a representative F1/F2/F3 (median of valid
frames). Invalid takes are labelled but still returned so the frontend can tell
the user which passes were ignored and why.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .analysis import FormantFrames
from .config import QualityConfig
from .models import Quality


@dataclass
class TakeQuality:
    quality: Quality
    f1: float | None
    f2: float | None
    f3: float | None
    valid_frame_ratio: float


def _valid_frame_mask(frames: FormantFrames, cfg: QualityConfig) -> np.ndarray:
    f1, f2, f3 = frames.f1, frames.f2, frames.f3
    finite = np.isfinite(f1) & np.isfinite(f2) & np.isfinite(f3)
    ordered = finite & (f1 < f2) & (f2 < f3)
    in_range = (
        (f1 >= cfg.f1_min) & (f1 <= cfg.f1_max)
        & (f2 >= cfg.f2_min) & (f2 <= cfg.f2_max)
        & (f3 >= cfg.f3_min) & (f3 <= cfg.f3_max)
    )
    return ordered & in_range


def assess_take(
    frames: FormantFrames,
    cfg: QualityConfig,
    *,
    duration_ms: float,
    min_take_ms: float,
    is_low_energy: bool,
) -> TakeQuality:
    """Classify a take and compute its representative formants."""
    if is_low_energy:
        return TakeQuality("low_energy", None, None, None, 0.0)
    if duration_ms < min_take_ms:
        return TakeQuality("too_short", None, None, None, 0.0)

    total = len(frames.f1)
    if total == 0:
        return TakeQuality("formant_unreliable", None, None, None, 0.0)

    mask = _valid_frame_mask(frames, cfg)
    ratio = float(np.count_nonzero(mask)) / total

    if ratio < cfg.min_valid_frame_ratio:
        return TakeQuality("formant_unreliable", None, None, None, ratio)

    # Median over valid frames is robust to tracker jumps.
    f1 = round(float(np.median(frames.f1[mask])), 1)
    f2 = round(float(np.median(frames.f2[mask])), 1)
    f3 = round(float(np.median(frames.f3[mask])), 1)
    return TakeQuality("ok", f1, f2, f3, ratio)
