"""praat-parselmouth wrappers: formant tracks and fundamental frequency.

Burg method (Praat default), max 5 formants, gender-dependent frequency ceiling
(male ~5000 Hz, female ~5500 Hz) — all configurable (dev doc §6.5).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import parselmouth
from parselmouth.praat import call

from .config import FormantsConfig, SteadyStateConfig
from .segmentation import Segment


@dataclass
class FormantFrames:
    times: np.ndarray
    f1: np.ndarray  # Hz, may contain NaN
    f2: np.ndarray
    f3: np.ndarray


def formant_track(
    snd: parselmouth.Sound, gender: str, cfg: FormantsConfig
) -> tuple[parselmouth.Formant, np.ndarray]:
    """Compute a Burg formant object over the whole sound and its frame times."""
    max_freq = cfg.max_frequency_female if gender == "female" else cfg.max_frequency_male
    formant = snd.to_formant_burg(
        time_step=cfg.time_step,
        max_number_of_formants=cfg.max_formants,
        maximum_formant=max_freq,
        window_length=cfg.window_length,
        pre_emphasis_from=cfg.pre_emphasis,
    )
    return formant, formant.xs().astype(float)


def sample_formants(
    formant: parselmouth.Formant, times: np.ndarray, window: Segment
) -> FormantFrames:
    """Sample F1/F2/F3 at every formant frame that falls inside `window`."""
    mask = (times >= window.start_s) & (times <= window.end_s)
    sel = times[mask]
    f1 = np.array([formant.get_value_at_time(1, t) for t in sel])
    f2 = np.array([formant.get_value_at_time(2, t) for t in sel])
    f3 = np.array([formant.get_value_at_time(3, t) for t in sel])
    return FormantFrames(times=sel, f1=f1, f2=f2, f3=f3)


def flattest_subwindow(
    formant: parselmouth.Formant, times: np.ndarray, take: Segment, cfg: SteadyStateConfig
) -> Segment:
    """Optional upgrade: slide a small window over the take's middle and pick the
    one with the lowest combined F1/F2 frame-to-frame variance (the flattest).
    """
    win_s = cfg.flattest_window_ms / 1000.0
    if take.duration_s <= win_s:
        return take
    step = win_s / 2.0
    best: tuple[float, Segment] | None = None
    start = take.start_s
    while start + win_s <= take.end_s:
        seg = Segment(start_s=start, end_s=start + win_s)
        frames = sample_formants(formant, times, seg)
        f1 = frames.f1[np.isfinite(frames.f1)]
        f2 = frames.f2[np.isfinite(frames.f2)]
        if len(f1) >= 2 and len(f2) >= 2:
            var = float(np.var(f1) + np.var(f2))
            if best is None or var < best[0]:
                best = (var, seg)
        start += step
    return best[1] if best else take


def f0_median(snd: parselmouth.Sound, window: Segment, gender: str) -> float | None:
    """Median F0 (Hz) over the steady window; None if unvoiced."""
    floor, ceiling = (75.0, 300.0) if gender == "male" else (100.0, 500.0)
    try:
        part = snd.extract_part(
            from_time=window.start_s, to_time=window.end_s, preserve_times=True
        )
        pitch = part.to_pitch(pitch_floor=floor, pitch_ceiling=ceiling)
        freqs = pitch.selected_array["frequency"]
        voiced = freqs[freqs > 0]
        if voiced.size == 0:
            return None
        return round(float(np.median(voiced)), 1)
    except Exception:  # noqa: BLE001 - F0 is auxiliary; never fail the request
        return None
