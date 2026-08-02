"""User-built reference sets: persistent 'standard' F1/F2 sets assembled from a
learner's own recordings/uploads (one clip per vowel), selectable later as the
comparison target with playable demo audio.

Storage layout (under settings.reference_sets_path()):

    <set_id>/
        meta.json                 # ReferenceSet (metadata + analyzed vowels)
        audio/<vowel_slug>.wav    # normalized mono WAV per analyzed vowel

Everything is plain files so the data is transparent, backup-able, and never
touches the primary literature reference (which still drives default scoring).
"""

from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path

from .config import settings
from .models import (
    Gender,
    ReferenceSet,
    ReferenceSetVowel,
    VowelReference,
)


class ReferenceSetError(Exception):
    """Raised for not-found / invalid reference-set operations."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _slug_id(name: str) -> str:
    base = re.sub(r"[^a-zA-Z0-9]+", "-", name).strip("-").lower() or "set"
    return f"{base[:32]}-{uuid.uuid4().hex[:8]}"


def vowel_slug(vowel_id: str) -> str:
    """Filesystem-safe key for a vowel id (which may contain IPA length marks
    like 'iː'). Deterministic and reversible-enough for a filename."""
    return "".join(
        c if (c.isascii() and c.isalnum()) else f"u{ord(c):04x}" for c in vowel_id
    )


# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

def _root() -> Path:
    root = settings.reference_sets_path()
    root.mkdir(parents=True, exist_ok=True)
    return root


def _set_dir(set_id: str) -> Path:
    # Guard against path traversal from a crafted id.
    if not re.fullmatch(r"[A-Za-z0-9._-]+", set_id or ""):
        raise ReferenceSetError("非法的集合 ID。")
    return _root() / set_id


def _meta_path(set_id: str) -> Path:
    return _set_dir(set_id) / "meta.json"


def _audio_dir(set_id: str) -> Path:
    return _set_dir(set_id) / "audio"


def audio_path(set_id: str, vowel_id: str) -> Path | None:
    p = _audio_dir(set_id) / f"{vowel_slug(vowel_id)}.wav"
    return p if p.is_file() else None


# --------------------------------------------------------------------------- #
# Load / save
# --------------------------------------------------------------------------- #

def _read(set_id: str) -> ReferenceSet:
    mp = _meta_path(set_id)
    if not mp.is_file():
        raise ReferenceSetError(f"标准音库不存在：{set_id}")
    data = json.loads(mp.read_text(encoding="utf-8"))
    return ReferenceSet(**data)


def _write(rs: ReferenceSet) -> None:
    d = _set_dir(rs.id)
    d.mkdir(parents=True, exist_ok=True)
    _meta_path(rs.id).write_text(
        rs.model_dump_json(indent=2), encoding="utf-8"
    )


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #

def list_sets() -> list[ReferenceSet]:
    root = _root()
    out: list[ReferenceSet] = []
    for child in sorted(root.iterdir()):
        if not child.is_dir():
            continue
        try:
            out.append(_read(child.name))
        except (ReferenceSetError, json.JSONDecodeError, ValueError):
            continue  # skip corrupt dirs rather than failing the whole list
    out.sort(key=lambda s: s.created_at)
    return out


def get_set(set_id: str) -> ReferenceSet:
    return _read(set_id)


def create_set(name: str, gender: Gender) -> ReferenceSet:
    name = (name or "").strip() or "未命名标准音库"
    rs = ReferenceSet(
        id=_slug_id(name),
        name=name,
        gender=gender,
        created_at=_now(),
        updated_at=_now(),
        vowels=[],
    )
    _write(rs)
    return rs


def patch_set(set_id: str, name: str | None, gender: Gender | None) -> ReferenceSet:
    rs = _read(set_id)
    if name is not None and name.strip():
        rs.name = name.strip()
    if gender is not None:
        rs.gender = gender
    rs.updated_at = _now()
    _write(rs)
    return rs


def delete_set(set_id: str) -> None:
    d = _set_dir(set_id)
    if not d.is_dir():
        raise ReferenceSetError(f"标准音库不存在：{set_id}")
    # Remove audio files then the tree (shallow, no nested surprises expected).
    for f in sorted(d.rglob("*"), reverse=True):
        f.unlink() if f.is_file() else f.rmdir()
    d.rmdir()


def upsert_vowel(
    set_id: str,
    vowel: ReferenceSetVowel,
    wav_bytes: bytes | None,
) -> ReferenceSet:
    """Add/replace one analyzed vowel (and its demo audio) in the set."""
    rs = _read(set_id)
    if wav_bytes is not None:
        _audio_dir(set_id).mkdir(parents=True, exist_ok=True)
        (_audio_dir(set_id) / f"{vowel_slug(vowel.id)}.wav").write_bytes(wav_bytes)
        vowel.has_audio = True
    else:
        vowel.has_audio = audio_path(set_id, vowel.id) is not None

    rs.vowels = [v for v in rs.vowels if v.id != vowel.id]
    rs.vowels.append(vowel)
    rs.updated_at = _now()
    _write(rs)
    return rs


def delete_vowel(set_id: str, vowel_id: str) -> ReferenceSet:
    rs = _read(set_id)
    rs.vowels = [v for v in rs.vowels if v.id != vowel_id]
    ap = _audio_dir(set_id) / f"{vowel_slug(vowel_id)}.wav"
    if ap.is_file():
        ap.unlink()
    rs.updated_at = _now()
    _write(rs)
    return rs


def target_for_set(set_id: str, vowel_id: str | None) -> VowelReference | None:
    """Build a scoring target from a set's vowel, so analysis can score against a
    user's own standard instead of the literature bullseye. No SD is stored, so
    the hint logic falls back to its default tolerances."""
    if not vowel_id:
        return None
    try:
        rs = _read(set_id)
    except ReferenceSetError:
        return None
    for v in rs.vowels:
        if v.id == vowel_id and v.f1_mean is not None and v.f2_mean is not None:
            return VowelReference(
                id=v.id,
                ipa=v.id,
                example_word="",
                type="user-set",
                f1_mean=v.f1_mean,
                f2_mean=v.f2_mean,
                f3_mean=v.f3_mean,
                f1_sd=None,
                f2_sd=None,
                has_reference=True,
            )
    return None
