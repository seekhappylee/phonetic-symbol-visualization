import { useCallback, useMemo, useState } from "react";
import FormantChart from "../components/FormantChart";
import MultiTakePanel from "../components/MultiTakePanel";
import Recorder from "../components/Recorder";
import WaveformEditor from "../components/WaveformEditor";
import { analyzeFormants } from "../api/client";
import { decodeBlob } from "../audio/audioBuffer";
import type {
  AnalyzeResponse,
  EditableSegment,
  Gender,
  SegmentSpec,
  Summary,
  Take,
  VowelsResponse,
} from "../types";

interface Props {
  data: VowelsResponse;
  gender: Gender;
  ffmpegAvailable: boolean;
  selectedVowel: string | null;
  onSelectVowel: (id: string) => void;
}

/**
 * Practice page (dev doc §1.3, §6.3-6.4): record multiple passes -> auto split
 * (transparent, shown on a waveform with the steady window overlaid) -> user can
 * play / adjust / manually re-slice each take -> re-analyze exactly those ranges
 * -> three-class plotting on the reversed-axis F1-F2 chart.
 */
export default function PracticePage({
  data,
  gender,
  ffmpegAvailable,
  selectedVowel,
  onSelectVowel,
}: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [segments, setSegments] = useState<EditableSegment[]>([]);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [dirty, setDirty] = useState(false);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetVowel = data.vowels.find((v) => v.id === selectedVowel) ?? null;
  const hasTarget = !!targetVowel?.has_reference;

  const kept = useMemo(
    () =>
      result
        ? result.takes.filter((t) => t.quality === "ok" && !excluded.has(t.index))
        : [],
    [result, excluded]
  );
  const effectiveSummary = useMemo(() => summarize(kept), [kept]);

  const analyze = useCallback(
    async (audio: Blob, segs: SegmentSpec[] | null) => {
      setBusy(true);
      setError(null);
      try {
        const res = await analyzeFormants(audio, gender, selectedVowel, segs);
        setResult(res);
        setSegments(takesToSegments(res.takes));
        setDirty(false);
        setExcluded(new Set());
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [gender, selectedVowel]
  );

  // On a new recording: decode for the waveform, then run the auto (VAD) pass.
  const handleRecorded = useCallback(
    async (b: Blob) => {
      setBlob(b);
      setResult(null);
      setSegments([]);
      setError(null);
      try {
        setBuffer(await decodeBlob(b));
      } catch {
        setBuffer(null); // waveform editing unavailable; analysis still works
      }
      await analyze(b, null);
    },
    [analyze]
  );

  const reanalyze = useCallback(() => {
    if (blob) void analyze(blob, segments.map(toSpec));
  }, [blob, segments, analyze]);

  const resetAuto = useCallback(() => {
    if (blob) void analyze(blob, null);
  }, [blob, analyze]);

  const onSegmentsChange = useCallback((segs: EditableSegment[]) => {
    setSegments(segs);
    setDirty(true);
  }, []);

  const toggleExclude = (index: number) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });

  return (
    <div className="page practice-page">
      <h2>录音练习：透明分遍 + 三类点对照</h2>

      {!ffmpegAvailable && (
        <div className="banner warn">
          后端未检测到 <code>ffmpeg</code>，浏览器录音（webm/opus）将无法转码分析。
          请在后端主机执行 <code>sudo apt install ffmpeg</code> 后重启后端。
        </div>
      )}

      <div className="practice-controls">
        <label>
          目标元音：
          <select
            value={selectedVowel ?? ""}
            onChange={(e) => onSelectVowel(e.target.value)}
          >
            <option value="">（不选，仅打点）</option>
            {data.vowels.map((v) => (
              <option key={v.id} value={v.id} disabled={!v.has_reference}>
                {v.ipa} — {v.example_word}
                {v.has_reference ? "" : "（无靶心）"}
              </option>
            ))}
          </select>
        </label>
        {targetVowel && !hasTarget && (
          <span className="muted">该元音无文献靶心，仅显示你的点。</span>
        )}
      </div>

      <Recorder onRecorded={handleRecorded} disabled={busy} />
      {busy && !result && <p className="muted">正在自动分遍与分析…</p>}
      {error && <p className="error-text">分析失败：{error}</p>}

      {result && (
        <div className="practice-grid">
          <div className="left-col">
            {buffer ? (
              <WaveformEditor
                buffer={buffer}
                segments={segments}
                takes={result.takes}
                dirty={dirty}
                busy={busy}
                onChange={onSegmentsChange}
                onReanalyze={reanalyze}
                onResetAuto={resetAuto}
              />
            ) : (
              <div className="banner warn">
                浏览器无法解码此录音用于波形显示（分析仍正常）。可尝试用 Chrome/Edge。
              </div>
            )}

            <MultiTakePanel
              result={{ ...result, summary: effectiveSummary }}
              excluded={excluded}
              onToggleExclude={toggleExclude}
            />
          </div>

          <div className="right-col">
            <figcaption>F1–F2 对照图（反向坐标）</figcaption>
            <FormantChart
              vowels={data.vowels}
              targetVowelId={selectedVowel}
              userTakes={dirty ? [] : kept}
              summary={dirty ? null : effectiveSummary}
              onPickVowel={onSelectVowel}
            />
            {dirty && (
              <p className="target-note">切分已改动，点波形上方「重新分析」刷新打点。</p>
            )}
            {targetVowel?.has_reference && !dirty && (
              <p className="target-note">
                当前靶心 <b>{targetVowel.ipa}</b>：F1={targetVowel.f1_mean} Hz，
                F2={targetVowel.f2_mean} Hz。把黑色的“你的点”尽量移进彩色椭圆内。
              </p>
            )}
          </div>
        </div>
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

/** Recompute the summary over the kept (ok + not excluded) takes. */
function summarize(kept: Take[]): Summary {
  if (kept.length === 0) {
    return {
      valid_count: 0,
      f1_center: null,
      f2_center: null,
      f1_spread: null,
      f2_spread: null,
      mean_distance_to_target: null,
    };
  }
  const f1 = kept.map((t) => t.f1 as number);
  const f2 = kept.map((t) => t.f2 as number);
  const dists = kept
    .map((t) => t.distance_to_target)
    .filter((d): d is number => d != null);
  return {
    valid_count: kept.length,
    f1_center: round(mean(f1)),
    f2_center: round(mean(f2)),
    f1_spread: round(std(f1)),
    f2_spread: round(std(f2)),
    mean_distance_to_target: dists.length ? round(mean(dists)) : null,
  };
}

const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length);
};
const round = (n: number) => Math.round(n * 10) / 10;
