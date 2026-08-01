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


def stats(snd) -> dict:
    cfg = copy.deepcopy(settings)
    contour = intensity_contour(snd, cfg.segmentation)
    thr = voicing_threshold(contour, cfg.segmentation)
    takes, _ = split_takes(snd, cfg.segmentation)
    return {
        "takes": len(takes),
        "thr": thr,
        "peak": float(np.percentile(contour.values, cfg.segmentation.peak_percentile)),
        "floor": float(np.percentile(contour.values, cfg.segmentation.noise_percentile)),
    }


if __name__ == "__main__":
    seg = settings.segmentation
    print("Peak-driven threshold = max(peak - voiced_drop_db, floor + offset)")
    print(f"peak_percentile={seg.peak_percentile}  voiced_drop_db={seg.voiced_drop_db}"
          f"  silence_split_ms={seg.silence_split_ms}\n")
    print("Two vowel takes with a breath in the gap, breath level vs the vowel peak:")
    print(f"{'breath_amp':>10} | {'peak':>6} {'floor':>6} {'thr':>6} | {'takes':>5}")
    print("-" * 46)
    for amp in (0.006, 0.012, 0.02, 0.04, 0.08):
        s = stats(build_two_takes_with_breath(amp))
        print(f"{amp:>10.3f} | {s['peak']:>6.1f} {s['floor']:>6.1f} {s['thr']:>6.1f}"
              f" | {s['takes']:>5}")
    print("\nExpect 2 takes: the breath sits below the peak-drop threshold.")
