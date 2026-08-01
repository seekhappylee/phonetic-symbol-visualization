import type {
  AnalyzeResponse,
  Gender,
  HealthResponse,
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

export async function analyzeFormants(
  audio: Blob,
  gender: Gender,
  targetVowelId: string | null
): Promise<AnalyzeResponse> {
  const form = new FormData();
  const ext = audio.type.includes("wav") ? "wav" : "webm";
  form.append("file", audio, `recording.${ext}`);
  form.append("gender", gender);
  if (targetVowelId) form.append("target_vowel_id", targetVowelId);
  return handle<AnalyzeResponse>(
    await fetch(`${API_BASE}/api/analyze/formants`, {
      method: "POST",
      body: form,
    })
  );
}
