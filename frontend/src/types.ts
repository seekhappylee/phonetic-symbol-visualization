// Shared types mirroring the backend Pydantic models.

export type Gender = "male" | "female";
export type Quality = "ok" | "low_energy" | "too_short" | "formant_unreliable";

export interface VowelReference {
  id: string;
  ipa: string;
  example_word: string;
  type: string;
  f1_mean: number | null;
  f2_mean: number | null;
  f3_mean: number | null;
  f1_sd: number | null;
  f2_sd: number | null;
  has_reference: boolean;
  reference_note?: string | null;
  demo_audio?: string | null;
  demo_f1?: number | null;
  demo_f2?: number | null;
}

export interface VowelsResponse {
  accent: string;
  notation: string;
  source: string;
  gender: Gender;
  unit: string;
  vowels: VowelReference[];
}

/** One vowel centroid from a secondary (display-only) reference dataset. */
export interface OverlayVowel {
  id: string;
  f1_mean: number | null;
  f2_mean: number | null;
  f1_sd: number | null;
  f2_sd: number | null;
}

/** An extra literature dataset overlaid on the F1-F2 chart for comparison.
 *  It does NOT drive analysis/scoring (that stays on the primary reference). */
export interface ReferenceOverlay {
  id: string;
  label: string;
  source: string;
  note?: string | null;
  statistic: string; // "mean" | "median" | ...
  gender: Gender;
  has_data: boolean;
  vowels: OverlayVowel[];
}

export interface OverlaysResponse {
  gender: Gender;
  overlays: ReferenceOverlay[];
}

/** One analyzed vowel inside a user-built reference set (their own audio). */
export interface ReferenceSetVowel {
  id: string;
  f1_mean: number | null;
  f2_mean: number | null;
  f3_mean: number | null;
  start_ms: number | null;
  end_ms: number | null;
  steady_start_ms: number | null;
  steady_end_ms: number | null;
  quality: Quality | null;
  has_audio: boolean;
}

/** A user-created "standard" F1/F2 set, selectable as the comparison target. */
export interface ReferenceSet {
  id: string;
  name: string;
  gender: Gender;
  created_at: string;
  updated_at: string;
  vowels: ReferenceSetVowel[];
}

export interface ReferenceSetsResponse {
  sets: ReferenceSet[];
}

export interface Take {
  index: number;
  f0: number | null;
  f1: number | null;
  f2: number | null;
  f3: number | null;
  start_ms: number;
  end_ms: number;
  duration_ms: number;
  steady_start_ms: number | null;
  steady_end_ms: number | null;
  quality: Quality;
  distance_to_target: number | null;
  hint: string | null;
}

/** A client-specified analysis region sent to the backend (waveform editor). */
export interface SegmentSpec {
  start_ms: number;
  end_ms: number;
  steady_start_ms?: number | null;
  steady_end_ms?: number | null;
}

/** A take region being edited on the waveform (client-side geometry). */
export interface EditableSegment {
  id: string;
  start_ms: number;
  end_ms: number;
  steady_start_ms: number;
  steady_end_ms: number;
}

export interface Summary {
  valid_count: number;
  f1_center: number | null;
  f2_center: number | null;
  f1_spread: number | null;
  f2_spread: number | null;
  mean_distance_to_target: number | null;
}

export interface AnalyzeResponse {
  target_vowel_id: string | null;
  gender: Gender;
  takes: Take[];
  summary: Summary;
  warnings: string[];
}

export interface HealthResponse {
  status: string;
  ffmpeg_available: boolean;
  parselmouth_version: string;
  default_gender: Gender;
  reference_loaded: boolean;
  frontend_served: boolean;
  notes: string[];
}

export const QUALITY_LABELS: Record<Quality, string> = {
  ok: "合格",
  low_energy: "能量过低",
  too_short: "时长过短",
  formant_unreliable: "共振峰不可靠",
};
