"""Analysis pipeline: recording -> takes -> steady state -> formants -> QC -> summary.

Orchestrates the modules per dev doc §6.2:
    transcode -> VAD split -> per-take steady window -> F0/F1/F2/F3 -> QC -> stats
"""

from __future__ import annotations

import numpy as np
import parselmouth

from .analysis import f0_median, flattest_subwindow, formant_track, sample_formants
from .config import Config
from .models import AnalyzeResponse, Gender, Summary, Take
from .quality import assess_take
from .reference import articulatory_hint, distance_to_target, target_for
from .segmentation import Segment, split_takes, steady_state_window


def analyze_recording(
    snd: parselmouth.Sound,
    gender: Gender,
    target_vowel_id: str | None,
    cfg: Config,
) -> AnalyzeResponse:
    warnings: list[str] = []

    takes_seg, contour = split_takes(snd, cfg.segmentation)
    if not takes_seg:
        # Fallback: treat the whole recording as one take so the user still gets
        # a result and a clear message (manual fallback lives in the frontend).
        total = snd.get_total_duration()
        takes_seg = [Segment(0.0, total)]
        warnings.append(
            "未检测到清晰的发声段（可能录音过弱或环境噪声高）。已按整段分析；"
            "如录了多遍，请调高音量或改用逐遍录音。"
        )

    # One formant object over the whole recording; sampled per take window.
    formant, times = formant_track(snd, gender, cfg.formants)
    target = target_for(gender, target_vowel_id)

    takes: list[Take] = []
    valid_f1: list[float] = []
    valid_f2: list[float] = []
    valid_dist: list[float] = []

    for i, seg in enumerate(takes_seg, start=1):
        duration_ms = seg.duration_s * 1000.0

        window = steady_state_window(seg, cfg.steady_state)
        if cfg.steady_state.use_flattest_window:
            window = flattest_subwindow(formant, times, window, cfg.steady_state)

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


def _is_low_energy(contour, seg: Segment, cfg: Config) -> bool:
    """A take whose peak intensity barely exceeds the noise floor is low energy."""
    from .segmentation import voicing_threshold

    mask = (contour.times >= seg.start_s) & (contour.times <= seg.end_s)
    if not mask.any():
        return True
    peak = float(np.max(contour.values[mask]))
    return peak <= voicing_threshold(contour, cfg.segmentation)


def _summarize(
    f1: list[float], f2: list[float], dist: list[float]
) -> Summary:
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
