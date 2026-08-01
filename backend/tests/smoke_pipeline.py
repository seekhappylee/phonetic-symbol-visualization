"""Smoke test: synthesize vowel-like sounds (pulse train through formant
resonators), run the analysis pipeline, and check recovered F1/F2 are close to
the synthesized targets. No microphone / no ffmpeg needed.

Run:  uv run python tests/smoke_pipeline.py
"""

from __future__ import annotations

import numpy as np
import parselmouth
from parselmouth.praat import call

from app.config import settings
from app.pipeline import analyze_recording


def synth_vowel(formants, fs=16000, dur=0.5, f0=120.0, silence=0.0) -> np.ndarray:
    """Synthesize a realistic vowel with Praat's KlattGrid (authoritative)."""
    kg = call("Create KlattGrid", "v", 0.0, dur, len(formants), 0, 0, 0, 0, 0, 0)
    call(kg, "Add pitch point", 0.0, f0)
    call(kg, "Add pitch point", dur, f0 * 0.98)  # slight, natural declination
    call(kg, "Add voicing amplitude point", dur / 2, 90.0)
    for i, (f, bw) in enumerate(formants, start=1):
        call(kg, "Add oral formant frequency point", i, dur / 2, float(f))
        call(kg, "Add oral formant bandwidth point", i, dur / 2, float(bw))
    snd = call(kg, "To Sound")
    values = snd.values[0]
    # resample-agnostic: Klatt default fs is 44100; keep as-is for analysis
    values = values / (np.max(np.abs(values)) + 1e-9)
    fs = int(round(1.0 / snd.dx))
    if silence > 0:
        pad = np.zeros(int(fs * silence))
        values = np.concatenate([pad, values, pad])
    return values, fs


def run_case(name, vowel_id, formants, gender, takes=1):
    if takes == 1:
        sig, fs = synth_vowel(formants, silence=0.1)
    else:
        # multiple passes separated by 0.5 s silence to test auto-splitting
        chunk, fs = synth_vowel(formants, silence=0.05)
        gap = np.zeros(int(fs * 0.5))
        sig = np.concatenate([c for _ in range(takes) for c in (chunk, gap)])

    snd = parselmouth.Sound(sig, sampling_frequency=fs)
    resp = analyze_recording(snd, gender, vowel_id, settings)
    ok = [t for t in resp.takes if t.quality == "ok"]
    print(f"\n[{name}] target={vowel_id} gender={gender} expected takes={takes}")
    print(f"  detected takes={len(resp.takes)}  ok={len(ok)}")
    for t in resp.takes:
        print(
            f"  take{t.index}: {t.quality:18s} "
            f"F1={t.f1} F2={t.f2} F3={t.f3} dur={t.duration_ms}ms dist={t.distance_to_target}"
        )
    print(f"  summary: {resp.summary.model_dump()}")
    for w in resp.warnings:
        print(f"  warning: {w}")
    return resp


if __name__ == "__main__":
    # Deterding male /iː/ = F1 280, F2 2249, F3 2765 ; /ɑː/ = 646, 1155, 2490.
    # F4/F5 added (generic) for a realistic 5-formant vocal tract.
    ii = [(280, 60), (2249, 120), (2765, 150), (3500, 200), (4500, 250)]
    aa = [(646, 90), (1155, 110), (2490, 150), (3500, 200), (4500, 250)]
    run_case("iː single take (male)", "iː", ii, "male")
    run_case("ɑː single take (male)", "ɑː", aa, "male")
    run_case("iː three takes (male)", "iː", ii, "male", takes=3)
