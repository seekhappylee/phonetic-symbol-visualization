import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { EditableSegment, Take } from "../types";
import { QUALITY_LABELS } from "../types";
import { computePeaks, playRegion, type PlayHandle } from "../audio/audioBuffer";
import SteadyStateHelp from "./SteadyStateHelp";

interface Props {
  buffer: AudioBuffer;
  segments: EditableSegment[];
  takes: Take[] | null; // aligned by position; null/dirty => pending (grey)
  dirty: boolean; // geometry changed since last analysis
  busy: boolean;
  onChange: (segs: EditableSegment[]) => void;
  onReanalyze: () => void;
  onResetAuto: () => void;
}

const VB_W = 1000;
const WAVE_H = 120;
const MID = WAVE_H / 2;
const AMP = WAVE_H / 2 - 6;
const BUCKETS = 600;
const MIN_TAKE_MS = 60;
const MIN_STEADY_MS = 30;

type Edge = "take-start" | "take-end" | "steady-start" | "steady-end";
interface Drag {
  id: string;
  edge: Edge;
  creating?: boolean;
}

let uid = 0;
const newId = () => `seg-${Date.now()}-${uid++}`;

export default function WaveformEditor({
  buffer,
  segments,
  takes,
  dirty,
  busy,
  onChange,
  onReanalyze,
  onResetAuto,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const totalMs = buffer.duration * 1000;
  const [drag, setDrag] = useState<Drag | null>(null);
  const [addMode, setAddMode] = useState(false);
  const [playing, setPlaying] = useState<PlayHandle | null>(null);
  const [playhead, setPlayhead] = useState<number | null>(null); // ms
  // Horizontal zoom: stretch the waveform wider than its container so the user
  // can scroll and place the steady window far more precisely.
  const [zoom, setZoom] = useState(1);

  const peaksPath = useMemo(() => buildPeaksPath(buffer), [buffer]);

  // Time gridlines: aim for a readable number of divisions across the (zoomed)
  // width. Step shrinks as zoom grows so finer selection stays oriented.
  const gridTicks = useMemo(() => {
    const targetDivs = 8 * zoom;
    const rawStep = totalMs / targetDivs;
    const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
    const step = nice.find((s) => s >= rawStep) ?? 5000;
    const ticks: number[] = [];
    for (let ms = step; ms < totalMs; ms += step) ticks.push(ms);
    return ticks;
  }, [totalMs, zoom]);

  const msToX = useCallback((ms: number) => (ms / totalMs) * VB_W, [totalMs]);
  const xToMs = useCallback(
    (clientX: number) => {
      const rect = svgRef.current!.getBoundingClientRect();
      const frac = (clientX - rect.left) / rect.width;
      return Math.max(0, Math.min(totalMs, frac * totalMs));
    },
    [totalMs]
  );

  const sorted = useMemo(
    () => [...segments].sort((a, b) => a.start_ms - b.start_ms),
    [segments]
  );

  // ---- playback --------------------------------------------------------- //
  const stopPlay = useCallback(() => {
    playing?.stop();
    setPlaying(null);
    setPlayhead(null);
  }, [playing]);

  const play = useCallback(
    (startMs: number, endMs: number) => {
      playing?.stop();
      const startSec = startMs / 1000;
      const durSec = (endMs - startMs) / 1000;
      const t0 = performance.now();
      const h = playRegion(buffer, startSec, durSec, () => {
        setPlaying(null);
        setPlayhead(null);
      });
      setPlaying(h);
      const tick = () => {
        const el = (performance.now() - t0) / 1000;
        if (el >= durSec) return;
        setPlayhead(startMs + el * 1000);
        if (svgRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    },
    [buffer, playing]
  );

  useEffect(() => () => playing?.stop(), [playing]);

  // ---- edge dragging ---------------------------------------------------- //
  const applyEdge = useCallback(
    (list: EditableSegment[], id: string, edge: Edge, ms: number): EditableSegment[] => {
      const idx = list.findIndex((s) => s.id === id);
      if (idx < 0) return list;
      const s = { ...list[idx] };
      const prev = list[idx - 1];
      const next = list[idx + 1];
      const lo = prev ? prev.end_ms : 0;
      const hi = next ? next.start_ms : totalMs;

      if (edge === "take-start") {
        s.start_ms = clamp(ms, lo, s.end_ms - MIN_TAKE_MS);
        s.steady_start_ms = Math.max(s.steady_start_ms, s.start_ms);
        s.steady_end_ms = Math.max(s.steady_end_ms, s.steady_start_ms + MIN_STEADY_MS);
      } else if (edge === "take-end") {
        s.end_ms = clamp(ms, s.start_ms + MIN_TAKE_MS, hi);
        s.steady_end_ms = Math.min(s.steady_end_ms, s.end_ms);
        s.steady_start_ms = Math.min(s.steady_start_ms, s.steady_end_ms - MIN_STEADY_MS);
      } else if (edge === "steady-start") {
        s.steady_start_ms = clamp(ms, s.start_ms, s.steady_end_ms - MIN_STEADY_MS);
      } else {
        s.steady_end_ms = clamp(ms, s.steady_start_ms + MIN_STEADY_MS, s.end_ms);
      }
      const copy = [...list];
      copy[idx] = s;
      return copy;
    },
    [totalMs]
  );

  useEffect(() => {
    if (!drag) return;
    const move = (e: PointerEvent) => {
      const ms = xToMs(e.clientX);
      onChange(applyEdge(sorted, drag.id, drag.edge, ms));
    };
    const up = () => {
      // Finalize a freshly created segment: drop if too short, else set the
      // steady window to the central 50% of the take.
      if (drag.creating) {
        const seg = segments.find((s) => s.id === drag.id);
        if (!seg || seg.end_ms - seg.start_ms < MIN_TAKE_MS) {
          onChange(segments.filter((s) => s.id !== drag.id));
        } else {
          const w = seg.end_ms - seg.start_ms;
          onChange(
            segments.map((s) =>
              s.id === drag.id
                ? {
                    ...s,
                    steady_start_ms: s.start_ms + w * 0.25,
                    steady_end_ms: s.start_ms + w * 0.75,
                  }
                : s
            )
          );
        }
        setAddMode(false);
      }
      setDrag(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, sorted, segments, xToMs, applyEdge, onChange]);

  const startDrag = (id: string, edge: Edge) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    stopPlay();
    setDrag({ id, edge });
  };

  // ---- add new segment by dragging on empty space ----------------------- //
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (!addMode) return;
    const ms = xToMs(e.clientX);
    // Zero-width take that the user drags open by the end handle; the steady
    // window is set to the central 50% on release (see the `up` handler).
    const seg: EditableSegment = {
      id: newId(),
      start_ms: ms,
      end_ms: Math.min(totalMs, ms + 4),
      steady_start_ms: ms,
      steady_end_ms: Math.min(totalMs, ms + 4),
    };
    onChange([...segments, seg]);
    setDrag({ id: seg.id, edge: "take-end", creating: true });
  };

  const deleteSeg = (id: string) => onChange(segments.filter((s) => s.id !== id));

  return (
    <div className="waveform-editor">
      <div className="wave-toolbar">
        <button className="btn ghost" onClick={() => play(0, totalMs)} disabled={!!drag}>
          ▶ 全部
        </button>
        <button className="btn ghost" onClick={stopPlay} disabled={!playing}>
          ■ 停止
        </button>
        <button
          className={`btn ${addMode ? "primary" : "ghost"}`}
          onClick={() => setAddMode((v) => !v)}
        >
          {addMode ? "✓ 在波形上拖出新切片" : "＋ 手动添加切片"}
        </button>
        <button className="btn ghost" onClick={onResetAuto} disabled={busy}>
          ↻ 恢复自动分遍
        </button>
        <button
          className="btn primary"
          onClick={onReanalyze}
          disabled={busy || segments.length === 0}
        >
          {busy ? "分析中…" : `重新分析（${segments.length} 段）`}
        </button>
        {dirty && <span className="dirty-tag">切分已改动，请点「重新分析」</span>}
        <span className="wave-zoom">
          横轴缩放
          <input
            type="range"
            min={1}
            max={12}
            step={0.5}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            title="拉长横轴，做更细致的稳态选择"
          />
          <span className="wave-zoom-val">{zoom.toFixed(1)}×</span>
          {zoom !== 1 && (
            <button className="btn ghost tiny" onClick={() => setZoom(1)}>
              复位
            </button>
          )}
        </span>
      </div>

      <SteadyStateHelp />

      <div className="wave-scroll">
      <svg
        ref={svgRef}
        className={`waveform ${addMode ? "adding" : ""}`}
        viewBox={`0 0 ${VB_W} ${WAVE_H}`}
        preserveAspectRatio="none"
        onPointerDown={onBackgroundDown}
        style={{ width: `${zoom * 100}%` }}
      >
        <rect x={0} y={0} width={VB_W} height={WAVE_H} fill="#0b1020" />
        <line x1={0} y1={MID} x2={VB_W} y2={MID} stroke="#2a3350" strokeWidth={0.5} />
        {/* time gridlines (every `gridStepMs`) for orientation when zoomed */}
        {gridTicks.map((ms) => (
          <g key={`grid-${ms}`}>
            <line
              x1={msToX(ms)}
              y1={0}
              x2={msToX(ms)}
              y2={WAVE_H}
              stroke="#243056"
              strokeWidth={0.5}
            />
            <text x={msToX(ms) + 2} y={WAVE_H - 3} className="wave-tick">
              {(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 2)}s
            </text>
          </g>
        ))}
        <path d={peaksPath} fill="#5b8bf0" fillOpacity={0.85} />

        {sorted.map((s, i) => {
          const info = !dirty && takes && takes[i] ? takes[i] : null;
          const q = info?.quality;
          const steadyFill =
            q === "ok"
              ? "rgba(34,197,94,0.30)"
              : q
              ? "rgba(239,68,68,0.28)"
              : "rgba(255,255,255,0.16)";
          return (
            <g key={s.id}>
              {/* take region */}
              <rect
                x={msToX(s.start_ms)}
                y={0}
                width={msToX(s.end_ms) - msToX(s.start_ms)}
                height={WAVE_H}
                fill="rgba(91,139,240,0.08)"
                stroke="rgba(139,170,240,0.5)"
                strokeWidth={0.5}
              />
              {/* steady window */}
              <rect
                x={msToX(s.steady_start_ms)}
                y={0}
                width={msToX(s.steady_end_ms) - msToX(s.steady_start_ms)}
                height={WAVE_H}
                fill={steadyFill}
              />
              <text x={msToX(s.start_ms) + 4} y={14} className="wave-idx">
                {i + 1}
              </text>

              {/* take handles (grip at top) */}
              <EdgeHandle x={msToX(s.start_ms)} color="#8baaf0" grip="top" onDown={startDrag(s.id, "take-start")} />
              <EdgeHandle x={msToX(s.end_ms)} color="#8baaf0" grip="top" onDown={startDrag(s.id, "take-end")} />
              {/* steady handles (grip at bottom) */}
              <EdgeHandle x={msToX(s.steady_start_ms)} color="#22c55e" grip="bottom" onDown={startDrag(s.id, "steady-start")} />
              <EdgeHandle x={msToX(s.steady_end_ms)} color="#22c55e" grip="bottom" onDown={startDrag(s.id, "steady-end")} />
            </g>
          );
        })}

        {playhead != null && (
          <line
            x1={msToX(playhead)}
            y1={0}
            x2={msToX(playhead)}
            y2={WAVE_H}
            stroke="#fbbf24"
            strokeWidth={1}
          />
        )}
      </svg>
      </div>

      <div className="wave-legend">
        <span><span className="sw take" /> 切片范围（蓝框，拖顶部手柄）</span>
        <span><span className="sw steady" /> 稳态截取范围（绿色，拖底部手柄；实际分析的就是这段）</span>
      </div>

      {/* per-segment controls + info */}
      <div className="seg-list">
        {sorted.length === 0 && (
          <p className="muted">没有切片。点「＋ 手动添加切片」后在波形上拖出一段。</p>
        )}
        {sorted.map((s, i) => {
          const info = !dirty && takes && takes[i] ? takes[i] : null;
          return (
            <div className="seg-row" key={s.id}>
              <span className="seg-no">#{i + 1}</span>
              <span className="seg-time">
                切片 {fmtS(s.start_ms)}–{fmtS(s.end_ms)}s ·
                稳态 {fmtS(s.steady_start_ms)}–{fmtS(s.steady_end_ms)}s
              </span>
              <button className="btn tiny" onClick={() => play(s.start_ms, s.end_ms)}>
                ▶ 整段
              </button>
              <button
                className="btn tiny green"
                onClick={() => play(s.steady_start_ms, s.steady_end_ms)}
              >
                ▶ 稳态
              </button>
              {info ? (
                <span className={`seg-info q-${info.quality}`}>
                  {QUALITY_LABELS[info.quality]}
                  {info.f1 != null && ` · F1=${Math.round(info.f1)} F2=${Math.round(info.f2!)}`}
                </span>
              ) : (
                <span className="seg-info muted">待分析</span>
              )}
              <button className="btn tiny danger" onClick={() => deleteSeg(s.id)} title="删除切片">
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EdgeHandle({
  x,
  color,
  grip,
  onDown,
}: {
  x: number;
  color: string;
  grip: "top" | "bottom";
  onDown: (e: React.PointerEvent) => void;
}) {
  return (
    <g className="edge-handle" onPointerDown={onDown} style={{ cursor: "ew-resize" }}>
      {/* wide invisible hit area */}
      <rect x={x - 6} y={0} width={12} height={WAVE_H} fill="transparent" />
      <line x1={x} y1={0} x2={x} y2={WAVE_H} stroke={color} strokeWidth={1.5} />
      <rect
        x={x - 3}
        y={grip === "top" ? 0 : WAVE_H - 10}
        width={6}
        height={10}
        rx={2}
        fill={color}
      />
    </g>
  );
}

function buildPeaksPath(buffer: AudioBuffer): string {
  const peaks = computePeaks(buffer, BUCKETS);
  const n = BUCKETS;
  const top: string[] = [];
  const bottom: string[] = [];
  for (let b = 0; b < n; b++) {
    const x = (b / (n - 1)) * VB_W;
    const max = peaks[b * 2 + 1];
    const min = peaks[b * 2];
    top.push(`${x.toFixed(1)},${(MID - max * AMP).toFixed(1)}`);
    bottom.push(`${x.toFixed(1)},${(MID - min * AMP).toFixed(1)}`);
  }
  return `M ${top.join(" L ")} L ${bottom.reverse().join(" L ")} Z`;
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}
function fmtS(ms: number) {
  return (ms / 1000).toFixed(2);
}
