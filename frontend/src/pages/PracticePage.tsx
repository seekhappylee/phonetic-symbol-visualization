import { useMemo, useState } from "react";
import FormantChart from "../components/FormantChart";
import MultiTakePanel from "../components/MultiTakePanel";
import Recorder from "../components/Recorder";
import { analyzeFormants } from "../api/client";
import type { AnalyzeResponse, Gender, Summary, VowelsResponse } from "../types";

interface Props {
  data: VowelsResponse;
  gender: Gender;
  ffmpegAvailable: boolean;
  selectedVowel: string | null;
  onSelectVowel: (id: string) => void;
}

/**
 * Practice page (dev doc §1.3, functions 6-8): record multiple passes -> auto
 * split -> three-class plotting (literature bullseye + demo point + user takes
 * with center/spread) on the reversed-axis F1-F2 chart.
 */
export default function PracticePage({
  data,
  gender,
  ffmpegAvailable,
  selectedVowel,
  onSelectVowel,
}: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetVowel = data.vowels.find((v) => v.id === selectedVowel) ?? null;
  const hasTarget = !!targetVowel?.has_reference;

  // Manual exclusions recompute the summary and the chart points client-side,
  // while the panel still shows each take's true quality.
  const kept = useMemo(
    () =>
      result
        ? result.takes.filter((t) => t.quality === "ok" && !excluded.has(t.index))
        : [],
    [result, excluded]
  );
  const effectiveSummary = useMemo(() => summarize(kept), [kept]);

  async function runAnalysis() {
    if (!blob) return;
    setBusy(true);
    setError(null);
    setResult(null);
    setExcluded(new Set());
    try {
      const res = await analyzeFormants(blob, gender, selectedVowel);
      setResult(res);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleExclude(index: number) {
    setExcluded((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  return (
    <div className="page practice-page">
      <h2>录音练习：三类点打点对照</h2>

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

      <div className="practice-grid">
        <div className="left-col">
          <Recorder onRecorded={setBlob} disabled={busy} />
          <button
            className="btn primary analyze-btn"
            onClick={runAnalysis}
            disabled={!blob || busy}
          >
            {busy ? "分析中…" : "分析这段录音"}
          </button>
          {error && <p className="error-text">分析失败：{error}</p>}

          {result && (
            <MultiTakePanel
              result={{ ...result, summary: effectiveSummary }}
              excluded={excluded}
              onToggleExclude={toggleExclude}
            />
          )}
        </div>

        <div className="right-col">
          <figcaption>F1–F2 对照图（反向坐标）</figcaption>
          <FormantChart
            vowels={data.vowels}
            targetVowelId={selectedVowel}
            userTakes={kept}
            summary={effectiveSummary}
            onPickVowel={onSelectVowel}
          />
          {targetVowel?.has_reference && (
            <p className="target-note">
              当前靶心 <b>{targetVowel.ipa}</b>：F1={targetVowel.f1_mean} Hz，
              F2={targetVowel.f2_mean} Hz。把黑色的“你的点”尽量移进彩色椭圆内。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Recompute the summary over the kept (ok + not excluded) takes. */
function summarize(kept: AnalyzeResponse["takes"]): Summary {
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
