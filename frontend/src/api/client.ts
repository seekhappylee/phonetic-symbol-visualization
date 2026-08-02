import type {
  AnalyzeResponse,
  Gender,
  HealthResponse,
  OverlaysResponse,
  ReferenceSet,
  ReferenceSetsResponse,
  SegmentSpec,
  VowelsResponse,
} from "../types";

// Backend base URL. Override via VITE_API_BASE (see README). When the frontend
// is served by the backend itself (single-container), same-origin "" works.
const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "http://localhost:8000";

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `请求失败 (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) detail = body.detail;
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(detail);
  }
  return (await res.json()) as T;
}

export async function fetchHealth(): Promise<HealthResponse> {
  return handle<HealthResponse>(await fetch(`${API_BASE}/api/health`));
}

export async function fetchVowels(gender: Gender): Promise<VowelsResponse> {
  return handle<VowelsResponse>(
    await fetch(`${API_BASE}/api/vowels?gender=${gender}`)
  );
}

/** Secondary literature datasets for chart comparison (display-only). Returns an
 *  empty list when the backend has no overlay files configured. */
export async function fetchOverlays(gender: Gender): Promise<OverlaysResponse> {
  return handle<OverlaysResponse>(
    await fetch(`${API_BASE}/api/reference-overlays?gender=${gender}`)
  );
}

export async function analyzeFormants(
  audio: Blob,
  gender: Gender,
  targetVowelId: string | null,
  segments?: SegmentSpec[] | null,
  referenceSetId?: string | null
): Promise<AnalyzeResponse> {
  const form = new FormData();
  const ext = audio.type.includes("wav") ? "wav" : "webm";
  form.append("file", audio, `recording.${ext}`);
  form.append("gender", gender);
  if (targetVowelId) form.append("target_vowel_id", targetVowelId);
  // A chosen user set overrides the literature bullseye as the scoring target.
  if (referenceSetId) form.append("reference_set_id", referenceSetId);
  // When segments are provided, the backend analyzes exactly these ranges and
  // skips auto-splitting (waveform editor: review / adjust / manual re-slice).
  if (segments && segments.length > 0) {
    form.append("segments", JSON.stringify(segments));
  }
  return handle<AnalyzeResponse>(
    await fetch(`${API_BASE}/api/analyze/formants`, {
      method: "POST",
      body: form,
    })
  );
}

// --------------------------------------------------------------------------- //
// User-built reference sets ("standard" F1/F2 sets from the learner's own audio)
// --------------------------------------------------------------------------- //

export async function listReferenceSets(): Promise<ReferenceSetsResponse> {
  return handle<ReferenceSetsResponse>(
    await fetch(`${API_BASE}/api/reference-sets`)
  );
}

export async function getReferenceSet(id: string): Promise<ReferenceSet> {
  return handle<ReferenceSet>(
    await fetch(`${API_BASE}/api/reference-sets/${encodeURIComponent(id)}`)
  );
}

export async function createReferenceSet(
  name: string,
  gender: Gender
): Promise<ReferenceSet> {
  return handle<ReferenceSet>(
    await fetch(`${API_BASE}/api/reference-sets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, gender }),
    })
  );
}

export async function patchReferenceSet(
  id: string,
  patch: { name?: string; gender?: Gender }
): Promise<ReferenceSet> {
  return handle<ReferenceSet>(
    await fetch(`${API_BASE}/api/reference-sets/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  );
}

export async function deleteReferenceSet(id: string): Promise<void> {
  await handle<unknown>(
    await fetch(`${API_BASE}/api/reference-sets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    })
  );
}

export async function putReferenceSetVowel(
  setId: string,
  vowelId: string,
  audio: Blob,
  gender: Gender,
  segments?: SegmentSpec[] | null
): Promise<ReferenceSet> {
  const form = new FormData();
  const ext = audio.type.includes("wav") ? "wav" : "webm";
  form.append("file", audio, `clip.${ext}`);
  form.append("gender", gender);
  if (segments && segments.length > 0) {
    form.append("segments", JSON.stringify(segments));
  }
  return handle<ReferenceSet>(
    await fetch(
      `${API_BASE}/api/reference-sets/${encodeURIComponent(
        setId
      )}/vowels/${encodeURIComponent(vowelId)}`,
      { method: "PUT", body: form }
    )
  );
}

export async function deleteReferenceSetVowel(
  setId: string,
  vowelId: string
): Promise<ReferenceSet> {
  return handle<ReferenceSet>(
    await fetch(
      `${API_BASE}/api/reference-sets/${encodeURIComponent(
        setId
      )}/vowels/${encodeURIComponent(vowelId)}`,
      { method: "DELETE" }
    )
  );
}

/** URL for a set vowel's demo audio (use as <audio src>). */
export function referenceSetAudioUrl(setId: string, vowelId: string): string {
  return `${API_BASE}/api/reference-sets/${encodeURIComponent(
    setId
  )}/audio/${encodeURIComponent(vowelId)}`;
}
