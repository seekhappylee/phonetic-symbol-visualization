"""Externalized configuration.

Precedence (highest first):
    1. Environment variables  VOWEL_TRAINER_<SECTION>_<KEY>
    2. config.toml (if present next to backend/)
    3. Built-in defaults (mirroring config.example.toml)

Nothing analysis-related is hardcoded in the app modules; they read from here so
the same image/binary works across environments (see dev doc §2.3, §6.5).
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field, fields, is_dataclass
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parent.parent
ENV_PREFIX = "VOWEL_TRAINER_"


@dataclass
class GeneralConfig:
    default_gender: str = "male"
    reference_data_path: str = "app/data/vowels_rp.json"
    # Directory of optional secondary datasets overlaid (display-only) on the
    # F1-F2 chart for comparison; each *.json is one dataset. Empty dir is fine.
    reference_overlays_dir: str = "app/data/overlays"
    # Persistent storage for user-built reference sets (their own recordings):
    # one sub-dir per set with meta.json + audio/. Created on demand.
    reference_sets_dir: str = "data/reference_sets"
    demo_audio_dir: str = "app/data/demo_audio"
    frontend_dist: str = ""


@dataclass
class CorsConfig:
    allow_origins: list[str] = field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )


@dataclass
class FormantsConfig:
    max_formants: int = 5
    max_frequency_male: float = 5000.0
    max_frequency_female: float = 5500.0
    window_length: float = 0.025
    pre_emphasis: float = 50.0
    time_step: float = 0.01


@dataclass
class SegmentationConfig:
    # Continuous below-threshold time that separates two takes. Note the
    # *detectable* silence is usually much shorter than the wall-clock pause
    # (energy smears, breaths/tails intrude), so this is well under a "typical"
    # pause. Raise it if one take gets split; lower it if takes still merge.
    silence_split_ms: float = 220.0
    min_take_ms: float = 120.0
    # Voicing threshold is PEAK-driven (works well when background noise is low
    # and every vowel reaches near the same peak level):
    #   threshold = max(peak_level - voiced_drop_db,          # dominant term
    #                   noise_floor + threshold_db_above_floor) # safety net
    # peak_level = intensity at peak_percentile (a high percentile, not the raw
    # max, so a single click can't blow it out). Frames within voiced_drop_db of
    # the peak count as voicing; quieter sounds between takes (breaths, tails,
    # room noise) fall below and keep adjacent takes separate. The noise-floor
    # term only kicks in for unusually noisy recordings.
    peak_percentile: float = 95.0
    voiced_drop_db: float = 25.0
    noise_percentile: float = 10.0
    threshold_db_above_floor: float = 8.0
    frame_ms: float = 10.0


@dataclass
class SteadyStateConfig:
    mid_window_ratio: float = 0.5
    use_flattest_window: bool = False
    flattest_window_ms: float = 40.0


@dataclass
class QualityConfig:
    f1_min: float = 200.0
    f1_max: float = 1200.0
    f2_min: float = 600.0
    f2_max: float = 3200.0
    f3_min: float = 1500.0
    f3_max: float = 4000.0
    min_valid_frame_ratio: float = 0.5


@dataclass
class Config:
    general: GeneralConfig = field(default_factory=GeneralConfig)
    cors: CorsConfig = field(default_factory=CorsConfig)
    formants: FormantsConfig = field(default_factory=FormantsConfig)
    segmentation: SegmentationConfig = field(default_factory=SegmentationConfig)
    steady_state: SteadyStateConfig = field(default_factory=SteadyStateConfig)
    quality: QualityConfig = field(default_factory=QualityConfig)

    def reference_path(self) -> Path:
        return self._resolve(self.general.reference_data_path)

    def overlays_path(self) -> Path:
        return self._resolve(self.general.reference_overlays_dir)

    def reference_sets_path(self) -> Path:
        return self._resolve(self.general.reference_sets_dir)

    def demo_audio_path(self) -> Path:
        return self._resolve(self.general.demo_audio_dir)

    def frontend_dist_path(self) -> Path | None:
        raw = self.general.frontend_dist.strip()
        return self._resolve(raw) if raw else None

    def max_frequency_for(self, gender: str) -> float:
        return (
            self.formants.max_frequency_female
            if gender == "female"
            else self.formants.max_frequency_male
        )

    @staticmethod
    def _resolve(p: str) -> Path:
        path = Path(p)
        return path if path.is_absolute() else (BACKEND_DIR / path)


def _coerce(value: Any, target_type: type) -> Any:
    """Best-effort coerce a string/scalar to the dataclass field type."""
    if target_type is bool and isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    if target_type in (int, float) and isinstance(value, str):
        return target_type(value)
    if target_type is list or getattr(target_type, "__origin__", None) is list:
        if isinstance(value, str):
            return [v.strip() for v in value.split(",") if v.strip()]
        return list(value)
    return value


def _apply_table(section: Any, table: dict[str, Any]) -> None:
    valid = {f.name: f.type for f in fields(section)}
    for key, val in table.items():
        if key in valid:
            setattr(section, key, val)


def _apply_env(config: Config) -> None:
    for f in fields(config):
        section = getattr(config, f.name)
        if not is_dataclass(section):
            continue
        section_prefix = f"{ENV_PREFIX}{f.name.upper()}_"
        field_types = {sf.name: sf.type for sf in fields(section)}
        for env_key, env_val in os.environ.items():
            if not env_key.startswith(section_prefix):
                continue
            attr = env_key[len(section_prefix):].lower()
            if attr in field_types:
                setattr(section, attr, _coerce(env_val, field_types[attr]))


def load_config() -> Config:
    config = Config()

    # config.toml lookup: explicit env override, else backend/config.toml.
    toml_path_env = os.environ.get(f"{ENV_PREFIX}CONFIG_FILE")
    toml_path = Path(toml_path_env) if toml_path_env else (BACKEND_DIR / "config.toml")
    if toml_path.is_file():
        data = tomllib.loads(toml_path.read_text(encoding="utf-8"))
        for section_name, table in data.items():
            if hasattr(config, section_name) and isinstance(table, dict):
                _apply_table(getattr(config, section_name), table)

    _apply_env(config)
    return config


# Module-level singleton; import `settings` elsewhere.
settings = load_config()
