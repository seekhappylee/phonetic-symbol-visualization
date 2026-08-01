"""Energy-based endpoint detection: auto-split takes + pick steady-state window.

One implementation, two uses (dev doc §6.3/§6.4, note 5):
  * Outer level: split a whole recording into individual takes (passes), using a
    silence gap threshold (~400 ms) to avoid cutting on small within-take pauses.
  * Inner level: inside each take, take the central mid-window as the steady state
    (the vowel's "true self"), avoiding onset/offset transitions. Optionally
    upgrade to the flattest (minimum-variance) sub-window.

The energy threshold is adaptive/relative (noise floor + offset), never an
absolute dB value, so it survives changes of microphone/level.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import parselmouth

from .config import SegmentationConfig, SteadyStateConfig


@dataclass
class Segment:
    start_s: float
    end_s: float

    @property
    def duration_s(self) -> float:
        return self.end_s - self.start_s


@dataclass
class IntensityContour:
    times: np.ndarray  # frame center times (s)
    values: np.ndarray  # intensity (dB), NaN-free
    dt: float  # frame step (s)


# Bound the intensity contour to this many dB below its peak. Digital silence
# gives -inf dB; near-silence gives extreme negatives. Left as-is, those outliers
# dominate the percentiles used for the adaptive threshold. Clamping to
# [peak - DYNAMIC_CLAMP_DB, peak] keeps the noise-floor / dynamic-range estimates
# meaningful without distorting real speech (a real vowel-to-gap drop is <60 dB).
DYNAMIC_CLAMP_DB = 60.0


def intensity_contour(snd: parselmouth.Sound, cfg: SegmentationConfig) -> IntensityContour:
    """Compute a dB intensity contour sampled at ~frame_ms, clamped to a sane
    dynamic range so silence outliers don't corrupt the adaptive threshold."""
    time_step = max(cfg.frame_ms / 1000.0, 1e-3)
    # minimum_pitch drives the effective analysis window in Praat's intensity.
    intensity = snd.to_intensity(minimum_pitch=100.0, time_step=time_step, subtract_mean=True)
    values = intensity.values[0].astype(float)
    times = intensity.xs().astype(float)
    finite = np.isfinite(values)
    if finite.any():
        peak = float(np.max(values[finite]))
        floor = peak - DYNAMIC_CLAMP_DB
        values = np.where(finite, values, floor)  # -inf/NaN -> floor
        values = np.maximum(values, floor)        # clamp extreme negatives
    else:
        values = np.zeros_like(values)
    return IntensityContour(times=times, values=values, dt=time_step)


def voicing_threshold(contour: IntensityContour, cfg: SegmentationConfig) -> float:
    """Peak-driven voicing threshold (with a noise-floor safety net).

    threshold = max(peak_level - voiced_drop_db,          # dominant
                    noise_floor + threshold_db_above_floor) # safety net

    peak_level is a high percentile of intensity (robust to transient clicks).
    Frames within voiced_drop_db of the peak are voicing; quieter inter-take
    sounds (breaths, tails, room noise) fall below and keep takes separate. The
    noise-floor term only dominates for unusually noisy recordings, preventing
    the peak term from ever dipping into the noise.
    """
    peak_level = float(np.percentile(contour.values, cfg.peak_percentile))
    noise_floor = float(np.percentile(contour.values, cfg.noise_percentile))
    return max(
        peak_level - cfg.voiced_drop_db,
        noise_floor + cfg.threshold_db_above_floor,
    )


def detect_segments(
    contour: IntensityContour,
    cfg: SegmentationConfig,
    *,
    min_gap_ms: float,
    min_dur_ms: float,
) -> list[Segment]:
    """Group above-threshold frames into segments.

    Frames above `threshold` are voiced. Voiced runs separated by a silence gap
    shorter than `min_gap_ms` are merged (within-take pauses). Segments shorter
    than `min_dur_ms` after merging are dropped (clicks/breaths).
    """
    threshold = voicing_threshold(contour, cfg)
    voiced = contour.values > threshold
    if not voiced.any():
        return []

    dt = contour.dt
    times = contour.times

    # Find contiguous voiced runs as [start_idx, end_idx) index pairs.
    runs: list[list[int]] = []
    in_run = False
    start = 0
    for i, v in enumerate(voiced):
        if v and not in_run:
            in_run, start = True, i
        elif not v and in_run:
            in_run = False
            runs.append([start, i])
    if in_run:
        runs.append([start, len(voiced)])

    # Merge runs whose inter-run silence gap is below min_gap_ms.
    merged: list[list[int]] = []
    for run in runs:
        if merged:
            gap_s = times[run[0]] - times[merged[-1][1] - 1]
            if gap_s * 1000.0 < min_gap_ms:
                merged[-1][1] = run[1]
                continue
        merged.append(run)

    segments: list[Segment] = []
    for s, e in merged:
        # Segment spans from the first voiced frame to the last, inclusive.
        start_s = float(times[s] - dt / 2)
        end_s = float(times[e - 1] + dt / 2)
        seg = Segment(start_s=max(0.0, start_s), end_s=end_s)
        if seg.duration_s * 1000.0 >= min_dur_ms:
            segments.append(seg)
    return segments


def split_takes(
    snd: parselmouth.Sound, cfg: SegmentationConfig
) -> tuple[list[Segment], IntensityContour]:
    """Outer segmentation: split a recording into individual takes."""
    contour = intensity_contour(snd, cfg)
    takes = detect_segments(
        contour, cfg, min_gap_ms=cfg.silence_split_ms, min_dur_ms=cfg.min_take_ms
    )
    return takes, contour


def steady_state_window(take: Segment, cfg: SteadyStateConfig) -> Segment:
    """Inner extraction: central mid-window of a take (default steady state)."""
    ratio = min(max(cfg.mid_window_ratio, 0.05), 1.0)
    dur = take.duration_s
    margin = dur * (1.0 - ratio) / 2.0
    return Segment(start_s=take.start_s + margin, end_s=take.end_s - margin)
