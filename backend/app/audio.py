"""Audio ingestion: decode uploaded recordings to a mono parselmouth Sound.

The browser records webm/opus (MediaRecorder). parselmouth (Praat) cannot read
webm, so we transcode to WAV with ffmpeg. If ffmpeg is missing (e.g. WSL without
`apt install ffmpeg`), we still accept formats parselmouth can read directly
(WAV/AIFF/FLAC), and return a clear error for anything requiring ffmpeg.
"""

from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path

import parselmouth

# Extensions Praat/parselmouth can open natively (no ffmpeg needed).
_NATIVE_EXTS = {".wav", ".aiff", ".aifc", ".aif", ".flac", ".nist"}


class AudioDecodeError(Exception):
    """Raised when an upload cannot be decoded into a Sound."""


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


def _looks_like_wav(data: bytes) -> bool:
    return len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WAVE"


def load_sound(data: bytes, filename: str | None) -> parselmouth.Sound:
    """Decode raw upload bytes into a mono parselmouth Sound.

    Strategy:
      1. If it is (or looks like) a native format, load directly.
      2. Otherwise transcode via ffmpeg to 16-bit PCM WAV, then load.
    """
    ext = Path(filename or "").suffix.lower()
    is_native = ext in _NATIVE_EXTS or _looks_like_wav(data)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        src = tmp_dir / f"upload{ext or '.bin'}"
        src.write_bytes(data)

        if is_native:
            try:
                snd = parselmouth.Sound(str(src))
                return _to_mono(snd)
            except Exception as exc:  # noqa: BLE001 - surface a clean message
                # Fall through to ffmpeg if available; else report.
                if not ffmpeg_available():
                    raise AudioDecodeError(
                        f"无法直接读取音频（{ext or '未知格式'}），且系统未安装 ffmpeg。"
                    ) from exc

        if not ffmpeg_available():
            raise AudioDecodeError(
                "该录音格式需要 ffmpeg 转码（如浏览器的 webm/opus），"
                "但系统未安装 ffmpeg。请 `sudo apt install ffmpeg`，"
                "或改用可直接读取的 WAV 上传。"
            )

        wav = tmp_dir / "decoded.wav"
        proc = subprocess.run(
            [
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(src),
                "-ac", "1",            # mono
                "-c:a", "pcm_s16le",   # 16-bit PCM
                str(wav),
            ],
            capture_output=True,
        )
        if proc.returncode != 0 or not wav.exists():
            msg = proc.stderr.decode("utf-8", "replace").strip() or "ffmpeg 转码失败"
            raise AudioDecodeError(f"ffmpeg 转码失败：{msg}")

        try:
            return _to_mono(parselmouth.Sound(str(wav)))
        except Exception as exc:  # noqa: BLE001
            raise AudioDecodeError(f"转码后仍无法读取音频：{exc}") from exc


def _to_mono(snd: parselmouth.Sound) -> parselmouth.Sound:
    if snd.n_channels > 1:
        return snd.convert_to_mono()
    return snd
