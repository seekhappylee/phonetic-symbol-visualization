"""Reference vowel data: load Deterding (1997) targets + optional demo-audio
pre-analysis, and provide target lookup / distance / articulatory hints.
"""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .config import Config, settings
from .models import (
    Gender,
    OverlaysResponse,
    OverlayVowel,
    ReferenceOverlay,
    VowelReference,
    VowelsResponse,
)


@dataclass
class ReferenceData:
    accent: str
    notation: str
    source: str
    unit: str
    # gender -> {vowel_id -> VowelReference}
    by_gender: dict[str, dict[str, VowelReference]]


@lru_cache(maxsize=1)
def _load_raw() -> dict:
    path: Path = settings.reference_path()
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def load_reference() -> ReferenceData:
    raw = _load_raw()
    meta = raw["meta"]
    by_gender: dict[str, dict[str, VowelReference]] = {}
    for gender, vowels in raw["genders"].items():
        by_gender[gender] = {
            v["id"]: VowelReference(**{k: v.get(k) for k in VowelReference.model_fields})
            for v in vowels
        }
    data = ReferenceData(
        accent=meta["accent"],
        notation=meta["notation"],
        source=meta["source"],
        unit=meta.get("unit", "Hz"),
        by_gender=by_gender,
    )
    _attach_demo_analysis(data)
    return data


def vowels_response(gender: Gender) -> VowelsResponse:
    data = load_reference()
    if gender not in data.by_gender:
        gender = "male"  # safe fallback
    vowels = list(data.by_gender[gender].values())
    return VowelsResponse(
        accent=data.accent,
        notation=data.notation,
        source=data.source,
        gender=gender,
        unit=data.unit,
        vowels=vowels,
    )


# --------------------------------------------------------------------------- #
# Secondary datasets overlaid on the chart for comparison (display-only; they do
# NOT drive analysis/scoring). Each *.json in the overlays dir is one dataset.
# --------------------------------------------------------------------------- #

@lru_cache(maxsize=1)
def _load_overlays_raw() -> tuple[dict, ...]:
    d: Path = settings.overlays_path()
    if not d.is_dir():
        return ()
    out: list[dict] = []
    for p in sorted(d.glob("*.json")):
        try:
            out.append(json.loads(p.read_text(encoding="utf-8")))
        except (OSError, json.JSONDecodeError):
            continue  # a malformed overlay must never break the primary reference
    return tuple(out)


def overlays_response(gender: Gender) -> OverlaysResponse:
    overlays: list[ReferenceOverlay] = []
    for o in _load_overlays_raw():
        vowels_raw = (o.get("genders", {}) or {}).get(gender, []) or []
        vowels = [
            OverlayVowel(**{k: vv.get(k) for k in OverlayVowel.model_fields})
            for vv in vowels_raw
            if vv.get("f1_mean") is not None and vv.get("f2_mean") is not None
        ]
        overlays.append(
            ReferenceOverlay(
                id=o["id"],
                label=o["label"],
                source=o["source"],
                note=o.get("note"),
                statistic=o.get("statistic", "mean"),
                gender=gender,
                has_data=len(vowels) > 0,
                vowels=vowels,
            )
        )
    return OverlaysResponse(gender=gender, overlays=overlays)


def target_for(gender: Gender, vowel_id: str | None) -> VowelReference | None:
    if not vowel_id:
        return None
    data = load_reference()
    ref = data.by_gender.get(gender, {}).get(vowel_id)
    if ref is None or not ref.has_reference or ref.f1_mean is None:
        return None
    return ref


def distance_to_target(f1: float, f2: float, target: VowelReference) -> float:
    """Euclidean distance in Hz to the target centroid."""
    return round(math.hypot(f1 - target.f1_mean, f2 - target.f2_mean), 1)


def articulatory_hint(f1: float, f2: float, target: VowelReference) -> str | None:
    """Translate an F1/F2 offset into a tongue-position hint (reversed-axis logic).

    F1 ~ tongue height (open/close); F2 ~ frontness/backness.
    Only mention a dimension when the deviation exceeds ~1 target SD.
    """
    parts: list[str] = []
    f1_sd = target.f1_sd or 60.0
    f2_sd = target.f2_sd or 150.0

    if f2 - target.f2_mean <= -f2_sd:
        parts.append("舌位偏后（F2 偏低），试着把舌头往前伸")
    elif f2 - target.f2_mean >= f2_sd:
        parts.append("舌位偏前（F2 偏高），试着把舌头往后收")

    if f1 - target.f1_mean >= f1_sd:
        parts.append("开口偏大 / 舌位偏低（F1 偏高），试着略收下巴、抬高舌位")
    elif f1 - target.f1_mean <= -f1_sd:
        parts.append("开口偏小 / 舌位偏高（F1 偏低），试着略张口、放低舌位")

    if not parts:
        return "接近靶心，保持！"
    return "；".join(parts)


# --------------------------------------------------------------------------- #
# Demonstration audio pre-analysis (optional; graceful when absent).
# --------------------------------------------------------------------------- #

def _attach_demo_analysis(data: ReferenceData) -> None:
    """If a vowel has a demo_audio file present, pre-analyze its F1/F2 and cache
    it on the VowelReference (as the "demo point"). Missing demos are ignored.
    """
    demo_dir = settings.demo_audio_path()
    if not demo_dir.is_dir():
        return
    for vowels in data.by_gender.values():
        for ref in vowels.values():
            if not ref.demo_audio:
                continue
            audio_path = demo_dir / ref.demo_audio
            if not audio_path.is_file():
                continue
            point = _analyze_demo_file(audio_path, _gender_of(data, ref))
            if point is not None:
                ref.demo_f1, ref.demo_f2 = point


def _gender_of(data: ReferenceData, ref: VowelReference) -> Gender:
    for gender, vowels in data.by_gender.items():
        if ref in vowels.values():
            return gender  # type: ignore[return-value]
    return "male"


def _analyze_demo_file(path: Path, gender: Gender) -> tuple[float, float] | None:
    """Best-effort demo pre-analysis. Imported lazily to avoid a hard dependency
    at module import time and to keep reference loading cheap when no demos exist.
    """
    try:
        import parselmouth

        from .analysis import formant_track, sample_formants
        from .quality import assess_take
        from .segmentation import Segment, split_takes, steady_state_window

        cfg: Config = settings
        snd = parselmouth.Sound(str(path))
        if snd.n_channels > 1:
            snd = snd.convert_to_mono()
        takes, _ = split_takes(snd, cfg.segmentation)
        take = takes[0] if takes else Segment(0.0, snd.get_total_duration())
        window = steady_state_window(take, cfg.steady_state)
        formant, times = formant_track(snd, gender, cfg.formants)
        frames = sample_formants(formant, times, window)
        result = assess_take(
            frames,
            cfg.quality,
            duration_ms=take.duration_s * 1000.0,
            min_take_ms=0.0,
            is_low_energy=False,
        )
        if result.quality == "ok" and result.f1 is not None:
            return (result.f1, result.f2)
    except Exception:  # noqa: BLE001 - demo analysis is optional
        return None
    return None
