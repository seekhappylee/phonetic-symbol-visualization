// Browser-side audio helpers for the waveform editor: decode the recorded blob,
// compute waveform peaks, and play arbitrary time regions. The browser can decode
// its own recording (webm/opus or mp4), so no waveform data is needed from the
// backend — the backend stays the analysis authority (parselmouth).

let ctx: AudioContext | null = null;

function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctx = new Ctor();
  }
  return ctx;
}

/** Decode a recorded Blob into an AudioBuffer. */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const arr = await blob.arrayBuffer();
  // decodeAudioData consumes the ArrayBuffer; slice() to keep the blob reusable.
  return await audioContext().decodeAudioData(arr.slice(0));
}

/**
 * Compute min/max peaks over `buckets` columns from the first channel.
 * Returns a flat array [min0, max0, min1, max1, ...] normalized to [-1, 1].
 */
export function computePeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const data = buffer.getChannelData(0);
  const per = Math.max(1, Math.floor(data.length / buckets));
  const peaks = new Float32Array(buckets * 2);
  let peak = 0;
  for (let b = 0; b < buckets; b++) {
    const start = b * per;
    const end = Math.min(data.length, start + per);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      const v = data[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
    peak = Math.max(peak, max, -min);
  }
  // Normalize so the loudest sample reaches full height (nicer for quiet mics).
  if (peak > 0 && peak < 1) {
    for (let i = 0; i < peaks.length; i++) peaks[i] /= peak;
  }
  return peaks;
}

export interface PlayHandle {
  stop: () => void;
}

/**
 * Play a time region [startSec, startSec+durSec). `onEnded` fires when the
 * region finishes or is stopped. Returns a handle to stop it early.
 */
export function playRegion(
  buffer: AudioBuffer,
  startSec: number,
  durSec: number,
  onEnded?: () => void
): PlayHandle {
  const c = audioContext();
  if (c.state === "suspended") void c.resume();
  const src = c.createBufferSource();
  src.buffer = buffer;
  src.connect(c.destination);
  let stopped = false;
  src.onended = () => {
    if (!stopped) onEnded?.();
  };
  const dur = Math.max(0.02, durSec);
  src.start(0, Math.max(0, startSec), dur);
  return {
    stop: () => {
      stopped = true;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
      onEnded?.();
    },
  };
}
