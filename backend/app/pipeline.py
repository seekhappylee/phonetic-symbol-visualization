"""Analysis pipeline: recording -> takes -> steady state -> formants -> QC -> summary.

Orchestrates the modules per dev doc §6.2:
    transcode -> VAD split -> per-take steady window -> F0/F1/F2/F3 -> QC -> stats

Two modes:
  * Auto (no explicit segments): VAD auto-splits the recording into takes and
    picks each take's steady window.
  * Explicit (client supplies segments): analyze exactly the given take ranges
    (and optional steady sub-ranges), skipping VAD. This backs the frontend's
    waveform editor, where the user reviews / adjusts / manually re-slices.
"""

from __future__ import annotations

import numpy as np
import parselmouth

from .analysis import f0_median, flattest_subwindow, formant_track, sample_formants
from .config import Config
from .models import (
    AnalyzeResponse,
    Gender,
    SegmentSpec,
    Summary,
    Take,
    VowelReference,
)
from .quality import assess_take
from .reference import articulatory_hint, distance_to_target, target_for
from .segmentation import (
    Segment,
    intensity_contour,
    split_takes,
    steady_state_window,
    voicing_threshold,
)


def analyze_recording(
    snd: parselmouth.Sound,
    gender: Gender,
    target_vowel_id: str | None,
    cfg: Config,
    explicit_segments: list[SegmentSpec] | None = None,
    reference_target: VowelReference | None = None,
    scope_to_reference: bool = False,
) -> AnalyzeResponse:
    warnings: list[str] = []
    total_s = snd.get_total_duration()

    # Resolve the list of (take segment, steady window) pairs.
    if explicit_segments is not None:
        pairs = _resolve_explicit(explicit_segments, total_s, cfg)
        contour = intensity_contour(snd, cfg.segmentation)
        if not pairs:
            warnings.append("未提供有效的分析区段。")
    else:
        takes_seg, contour = split_takes(snd, cfg.segmentation)
        if not takes_seg:
            # Fallback: treat the whole recording as one take so the user still
            # gets a result and a clear message (manual editing lives in the UI).
            takes_seg = [Segment(0.0, total_s)]
            warnings.append(
                "未检测到清晰的发声段（可能录音过弱或环境噪声高）。已按整段分析；"
                "如录了多遍，请在波形图上手动调整切分。"
            )
        pairs = [(seg, _auto_steady(seg, cfg)) for seg in takes_seg]

    # One formant object over the whole recording; sampled per steady window.
    formant, times = formant_track(snd, gender, cfg.formants)
    if cfg.steady_state.use_flattest_window and explicit_segments is None:
        pairs = [(seg, flattest_subwindow(formant, times, win, cfg.steady_state))
                 for seg, win in pairs]

    # A user-selected reference set (if any) overrides the literature bullseye as
    # the scoring target. When the user explicitly scoped to a set, do NOT fall
    # back to the literature target (a vowel absent from the set has no target),
    # so scoring stays consistent with the chosen standard.
    if scope_to_reference:
        target = reference_target
    else:
        target = reference_target or target_for(gender, target_vowel_id)

    takes: list[Take] = []
    valid_f1: list[float] = []
    valid_f2: list[float] = []
    valid_dist: list[float] = []

    for i, (seg, window) in enumerate(pairs, start=1):
        duration_ms = seg.duration_s * 1000.0
        frames = sample_formants(formant, times, window)
        result = assess_take(
            frames,
            cfg.quality,
            duration_ms=duration_ms,
            min_take_ms=cfg.segmentation.min_take_ms,
            is_low_energy=_is_low_energy(contour, seg, cfg),
        )

        take = Take(
            index=i,
            f0=f0_median(snd, window, gender) if result.quality == "ok" else None,
            f1=result.f1,
            f2=result.f2,
            f3=result.f3,
            start_ms=round(seg.start_s * 1000.0, 1),
            end_ms=round(seg.end_s * 1000.0, 1),
            duration_ms=round(duration_ms, 1),
            steady_start_ms=round(window.start_s * 1000.0, 1),
            steady_end_ms=round(window.end_s * 1000.0, 1),
            quality=result.quality,
        )

        if result.quality == "ok" and result.f1 is not None:
            valid_f1.append(result.f1)
            valid_f2.append(result.f2)
            if target is not None:
                d = distance_to_target(result.f1, result.f2, target)
                take.distance_to_target = d
                take.hint = articulatory_hint(result.f1, result.f2, target)
                valid_dist.append(d)

        takes.append(take)

    ignored = [t.index for t in takes if t.quality != "ok"]
    if ignored:
        warnings.append(
            f"第 {', '.join(map(str, ignored))} 遍质量较低，已排除出统计（仍在列表中标注）。"
        )

    return AnalyzeResponse(
        target_vowel_id=target_vowel_id,
        gender=gender,
        takes=takes,
        summary=_summarize(valid_f1, valid_f2, valid_dist),
        warnings=warnings,
    )


def _auto_steady(seg: Segment, cfg: Config) -> Segment:
    return steady_state_window(seg, cfg.steady_state)


def _resolve_explicit(
    specs: list[SegmentSpec], total_s: float, cfg: Config
) -> list[tuple[Segment, Segment]]:
    """Turn client-supplied specs into clamped (take, steady) segment pairs."""
    pairs: list[tuple[Segment, Segment]] = []
    for spec in specs:
        start = _clamp(spec.start_ms / 1000.0, 0.0, total_s)
        end = _clamp(spec.end_ms / 1000.0, 0.0, total_s)
        if end - start < 0.01:  # ignore degenerate segments (<10 ms)
            continue
        take = Segment(start_s=start, end_s=end)

        if spec.steady_start_ms is not None and spec.steady_end_ms is not None:
            ss = _clamp(spec.steady_start_ms / 1000.0, start, end)
            se = _clamp(spec.steady_end_ms / 1000.0, start, end)
            steady = Segment(start_s=min(ss, se), end_s=max(ss, se))
            if steady.duration_s < 0.01:
                steady = _auto_steady(take, cfg)
        else:
            steady = _auto_steady(take, cfg)
        pairs.append((take, steady))
    return pairs


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _is_low_energy(contour, seg: Segment, cfg: Config) -> bool:
    """A take whose peak intensity barely exceeds the noise floor is low energy."""
    mask = (contour.times >= seg.start_s) & (contour.times <= seg.end_s)
    if not mask.any():
        return True
    peak = float(np.max(contour.values[mask]))
    return peak <= voicing_threshold(contour, cfg.segmentation)


def _summarize(f1: list[float], f2: list[float], dist: list[float]) -> Summary:
    if not f1:
        return Summary(valid_count=0)
    return Summary(
        valid_count=len(f1),
        f1_center=round(float(np.mean(f1)), 1),
        f2_center=round(float(np.mean(f2)), 1),
        # population SD (spread of the user's own takes); 0 when a single take.
        f1_spread=round(float(np.std(f1)), 1),
        f2_spread=round(float(np.std(f2)), 1),
        mean_distance_to_target=round(float(np.mean(dist)), 1) if dist else None,
    )
