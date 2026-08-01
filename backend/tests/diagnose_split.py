"""Reproduce the "two takes merge into one" auto-split problem and show the fix.

Two vowel takes separated by a gap that is NOT silent — it contains a low-level
"breath" (as happens with real recordings). We compare:
  * OLD threshold: noise_floor + 8 dB   (reproduced with threshold_range_ratio=0)
  * NEW threshold: noise_floor + max(8 dB, 0.35 * dynamic_range)

Run:  PYTHONPATH=. uv run python tests/diagnose_split.py
"""

from __future__ import annotations

import copy

import numpy as np
import parselmouth
from parselmouth.praat import call

from app.config import settings
from app.segmentation import intensity_contour, split_takes, voicing_threshold


def synth_vowel(formants, dur=0.5, f0=120.0):
    kg = call("Create KlattGrid", "v", 0.0, dur, len(formants), 0, 0, 0, 0, 0, 0)
    call(kg, "Add pitch point", 0.0, f0)
    call(kg, "Add voicing amplitude point", dur / 2, 90.0)
    for i, (f, bw) in enumerate(formants, start=1):
        call(kg, "Add oral formant frequency point", i, dur / 2, float(f))
        call(kg, "Add oral formant bandwidth point", i, dur / 2, float(bw))
    snd = call(kg, "To Sound")
    v = snd.values[0]
    return v / (np.max(np.abs(v)) + 1e-9), int(round(1.0 / snd.dx))


def build_two_takes_with_breath(breath_amp: float):
    ii = [(280, 60), (2249, 120), (2765, 150), (3500, 200), (4500, 250)]
    v, fs = synth_vowel(ii)
    rng = np.random.default_rng(0)
    lead = np.zeros(int(fs * 0.15))
    # Realistic inter-take gap: silence, then a short breath, then silence.
    gap_sil = np.zeros(int(fs * 0.15))
    breath = rng.standard_normal(int(fs * 0.12)) * breath_amp
    gap = np.concatenate([gap_sil, breath, gap_sil])
    sig = np.concatenate([lead, v, gap, v, lead])
    # A real room is never digitally silent: constant faint background noise.
    sig = sig + rng.standard_normal(len(sig)) * 0.002
    return parselmouth.Sound(sig, sampling_frequency=fs)


def count_with_ratio(snd, ratio: float) -> tuple[int, float]:
    cfg = copy.deepcopy(settings)
    cfg.segmentation.threshold_range_ratio = ratio
    contour = intensity_contour(snd, cfg.segmentation)
    thr = voicing_threshold(contour, cfg.segmentation)
    takes, _ = split_takes(snd, cfg.segmentation)
    return len(takes), thr


def longest_silence_ms(snd, ratio: float) -> float:
    """Longest continuous below-threshold stretch (the detectable inter-take gap)."""
    cfg = copy.deepcopy(settings)
    cfg.segmentation.threshold_range_ratio = ratio
    contour = intensity_contour(snd, cfg.segmentation)
    thr = voicing_threshold(contour, cfg.segmentation)
    silent = contour.values <= thr
    best = cur = 0
    for s in silent:
        cur = cur + 1 if s else 0
        best = max(best, cur)
    return best * contour.dt * 1000.0


if __name__ == "__main__":
    print("recorded 2 takes with a breath filling the gap between them.")
    print("gap authored = 400 ms; silence_split_ms default =", settings.segmentation.silence_split_ms, "\n")
    ratio = settings.segmentation.threshold_range_ratio
    print(f"{'breath_amp':>10} | {'OLD takes':>9} | {'NEW takes':>9} | {'NEW gap(ms)':>11}")
    print("-" * 52)
    for amp in (0.006, 0.012, 0.02, 0.04):
        snd = build_two_takes_with_breath(amp)
        old_n, _ = count_with_ratio(snd, 0.0)
        new_n, _ = count_with_ratio(snd, ratio)
        gap = longest_silence_ms(snd, ratio)
        print(f"{amp:>10.3f} | {old_n:>9} | {new_n:>9} | {gap:>11.0f}")
    print("\nIf NEW gap(ms) < silence_split_ms, the two takes still merge because")
    print("the detectable silence is shorter than the required split gap.")
