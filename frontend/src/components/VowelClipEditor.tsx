import { useCallback, useMemo, useRef, useState } from "react";
import Recorder from "./Recorder";
import WaveformEditor from "./WaveformEditor";
import {
  analyzeFormants,
  putReferenceSetVowel,
  deleteReferenceSetVowel,
  referenceSetAudioUrl,
} from "../api/client";
import { decodeBlob } from "../audio/audioBuffer";
import type {
  AnalyzeResponse,
  EditableSegment,
  Gender,
  ReferenceSet,
  ReferenceSetVowel,
  SegmentSpec,
  Take,
} from "../types";

interface Props {
  setId: string;
  gender: Gender;
  vowelId: string;
  ipa: string;
  exampleWord: string;
  existing?: ReferenceSetVowel;
  onSaved: (set: ReferenceSet) => void;
  onDeleted: (set: ReferenceSet) => void;
}

/**
 * Build ONE vowel of a reference set: record or upload a clip, slice it, pick the
 * steady window on the waveform, then save. Save persists the audio (playable as
 * a demo) and the analyzed F1/F2 on the backend. Mirrors the practice flow but
 * for a single vowel with an explicit Save.
 */
export default function VowelClipEditor({
  setId,
  gender,
  vowelId,
  ipa,
  exampleWord,
  existing,
  onSaved,
  onDeleted,
}: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const okTakes = useMemo(
    () => (result?.takes ?? []).filter((t) => t.quality === "ok" && t.f1 != null),
    [result]
  );
  const point = useMemo(() => {
    if (okTakes.length === 0) return null;
    const f1 = okTakes.reduce((s, t) => s + (t.f1 as number), 0) / okTakes.length;
    const f2 = okTakes.reduce((s, t) => s + (t.f2 as number), 0) / okTakes.length;
    return { f1: Math.round(f1), f2: Math.round(f2) };
  }, [okTakes]);

  const analyze = useCallback(
    async (audio: Blob, segs: SegmentSpec[] | null) => {
      setBusy(true);
      setError(null);
      try {
        const res = await analyzeFormants(audio, gender, vowelId, segs);
        setResult(res);
        setSegments(takesToSegments(res.takes));
        setDirty(false);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [gender, vowelId]
  );

  const handleAudio = useCallback(
    async (b: Blob) => {
      setBlob(b);
      setResult(null);
      setSegments([]);
      setError(null);
      try {
        setBuffer(await decodeBlob(b));
      } catch {
        setBuffer(null);
      }
      await analyze(b, null);
    },
    [analyze]
  );

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) void handleAudio(f);
    e.target.value = ""; // allow re-picking the same file
  };

  const save = useCallback(async () => {
    if (!blob) return;
    setSaving(true);
    setError(null);
    try {
      const set = await putReferenceSetVowel(
        setId,
        vowelId,
        blob,
        gender,
        segments.map(toSpec)
      );
      onSaved(set);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [blob, setId, vowelId, gender, segments, onSaved]);

  const removeVowel = useCallback(async () => {
    if (!confirm(`删除该套中的 /${ipa}/ ？`)) return;
    setSaving(true);
    try {
      const set = await deleteReferenceSetVowel(setId, vowelId);
      setBlob(null);
      setBuffer(null);
      setResult(null);
      setSegments([]);
      onDeleted(set);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }, [setId, vowelId, ipa, onDeleted]);

  return (
    <div className="clip-editor">
      <div className="clip-editor-head">
        <span className="big-ipa">{ipa}</span>
        <span className="muted">例词 {exampleWord}</span>
        {existing?.f1_mean != null ? (
          <span className="clip-existing">
            已存：F1={Math.round(existing.f1_mean)} · F2=
            {Math.round(existing.f2_mean as number)} Hz
          </span>
        ) : existing ? (
          <span className="clip-existing warn">已存音频，但未测得可靠共振峰</span>
        ) : (
          <span className="muted">尚未录入</span>
        )}
      </div>

      {existing?.has_audio && (
        <div className="clip-demo">
          <span className="muted">当前示范音：</span>
          <audio
            controls
            src={`${referenceSetAudioUrl(setId, vowelId)}?t=${encodeURIComponent(
              existing.f1_mean ?? 0
            )}`}
          />
          <button className="btn ghost tiny danger" onClick={removeVowel} disabled={saving}>
            删除该元音
          </button>
        </div>
      )}

      <div className="clip-input">
        <Recorder onRecorded={handleAudio} disabled={busy || saving} />
        <div className="clip-upload">
          <button className="btn ghost" onClick={() => fileRef.current?.click()}>
            ⤴ 上传音频文件
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            onChange={onPickFile}
            style={{ display: "none" }}
          />
          <span className="muted">支持 WAV / mp3 / webm 等</span>
        </div>
      </div>

      {busy && !result && <p className="muted">正在分析…</p>}
      {error && <p className="error-text">{error}</p>}

      {result && buffer && (
        <>
          <WaveformEditor
            buffer={buffer}
            segments={segments}
            takes={dirty ? null : result.takes}
            dirty={dirty}
            busy={busy}
            onChange={(segs) => {
              setSegments(segs);
              setDirty(true);
            }}
            onReanalyze={() => blob && analyze(blob, segments.map(toSpec))}
            onResetAuto={() => blob && analyze(blob, null)}
          />
          <div className="clip-save-row">
            {point ? (
              <span className="clip-point">
                本段稳态：F1=<b>{point.f1}</b> · F2=<b>{point.f2}</b> Hz
                {okTakes.length > 1 && `（${okTakes.length} 段均值）`}
              </span>
            ) : (
              <span className="muted">未测得可靠稳态；请调整切片/稳态段后重试。</span>
            )}
            <button
              className="btn primary"
              onClick={save}
              disabled={saving || busy || dirty || !point}
              title={dirty ? "请先「重新分析」" : ""}
            >
              {saving ? "保存中…" : existing ? "更新该元音" : "保存该元音"}
            </button>
            {dirty && <span className="muted">改动后请先「重新分析」再保存</span>}
          </div>
        </>
      )}
      {result && !buffer && (
        <p className="banner warn">
          浏览器无法解码此音频用于波形显示（仍可保存分析结果）。可改用 WAV 或 Chrome/Edge。
          {point && (
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? "保存中…" : "直接保存"}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

function takesToSegments(takes: Take[]): EditableSegment[] {
  return takes.map((t, i) => {
    const ss = t.steady_start_ms ?? t.start_ms + (t.end_ms - t.start_ms) * 0.25;
    const se = t.steady_end_ms ?? t.start_ms + (t.end_ms - t.start_ms) * 0.75;
    return {
      id: `take-${t.index}-${i}`,
      start_ms: t.start_ms,
      end_ms: t.end_ms,
      steady_start_ms: ss,
      steady_end_ms: se,
    };
  });
}

function toSpec(s: EditableSegment): SegmentSpec {
  return {
    start_ms: s.start_ms,
    end_ms: s.end_ms,
    steady_start_ms: s.steady_start_ms,
    steady_end_ms: s.steady_end_ms,
  };
}
