import { useMemo } from "react";

const W = 720;
const ROW_H = 150;
const GAP = 46;
const PAD_L = 60;
const PLOT_W = W - PAD_L - 30;

/**
 * The core source-filter figure (dev doc §7.2): three vertical layers linked by
 * × and =.
 *   1. Source: an evenly-decaying harmonic comb (F0 + harmonics).
 *   2. Filter: the vocal-tract resonance envelope with F1/F2 bumps.
 *   3. Output: comb × envelope — harmonics under F1/F2 are boosted (highlighted),
 *      the rest suppressed (grey). The vowel spectrum we actually hear.
 */
export default function SourceFilterFigure() {
  const f0 = 120;
  const fmax = 3600;
  const F1 = 500;
  const F2 = 1800;

  const harmonics = useMemo(() => {
    const arr: { f: number; srcAmp: number }[] = [];
    for (let f = f0; f <= fmax; f += f0) {
      // gentle source roll-off (~ -6 dB/oct proxy)
      arr.push({ f, srcAmp: Math.pow(f0 / f, 0.9) });
    }
    return arr;
  }, []);

  // resonance envelope: sum of two resonance peaks at F1, F2.
  const envAt = (f: number) => {
    const peak = (fc: number, bw: number, g: number) =>
      g / (1 + Math.pow((f - fc) / bw, 2));
    return Math.min(1, peak(F1, 180, 1.0) + peak(F2, 260, 0.75) + 0.06);
  };

  const xOf = (f: number) => PAD_L + (f / fmax) * PLOT_W;
  const barH = (amp: number) => amp * (ROW_H - 30);

  const totalH = ROW_H * 3 + GAP * 2 + 30;

  return (
    <svg viewBox={`0 0 ${W} ${totalH}`} className="source-filter" role="img">
      {/* Layer 1: source harmonic comb */}
      <Layer y={0} title="① 声源：谐波梳子（F0 + 谐波）">
        {harmonics.map((h, i) => (
          <line
            key={i}
            x1={xOf(h.f)}
            y1={ROW_H - 10}
            x2={xOf(h.f)}
            y2={ROW_H - 10 - barH(h.srcAmp)}
            stroke="#6b7280"
            strokeWidth={2}
          />
        ))}
        <text x={xOf(f0)} y={ROW_H + 4} className="tick">F0</text>
      </Layer>

      <Operator y={ROW_H + GAP / 2} symbol="×" />

      {/* Layer 2: filter envelope */}
      <Layer y={ROW_H + GAP} title="② 滤波器：声道共振包络（F1、F2 隆起）">
        <path
          d={envelopePath(envAt, xOf, ROW_H + GAP, fmax, f0)}
          fill="none"
          stroke="#2563eb"
          strokeWidth={2.5}
        />
        <FormantMarker x={xOf(F1)} y={ROW_H + GAP} label="F1" />
        <FormantMarker x={xOf(F2)} y={ROW_H + GAP} label="F2" />
      </Layer>

      <Operator y={ROW_H * 2 + GAP + GAP / 2} symbol="=" />

      {/* Layer 3: output = comb × envelope */}
      <Layer y={(ROW_H + GAP) * 2} title="③ 相乘结果：听到的元音频谱（F1、F2 处被顶高）">
        {harmonics.map((h, i) => {
          const amp = h.srcAmp * envAt(h.f);
          const boosted = envAt(h.f) > 0.5;
          const yBase = (ROW_H + GAP) * 2 + ROW_H - 10;
          return (
            <line
              key={i}
              x1={xOf(h.f)}
              y1={yBase}
              x2={xOf(h.f)}
              y2={yBase - barH(amp)}
              stroke={boosted ? "#dc2626" : "#c7cdd6"}
              strokeWidth={boosted ? 3 : 2}
            />
          );
        })}
        <FormantMarker x={xOf(F1)} y={(ROW_H + GAP) * 2} label="F1" faint />
        <FormantMarker x={xOf(F2)} y={(ROW_H + GAP) * 2} label="F2" faint />
      </Layer>

      {/* shared frequency axis note */}
      <text x={W / 2} y={totalH - 4} className="axis-label">
        频率 (Hz) →　（三层共用横轴）
      </text>
    </svg>
  );
}

function Layer({
  y,
  title,
  children,
}: {
  y: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <g>
      <text x={PAD_L} y={y + 14} className="layer-title">
        {title}
      </text>
      <line x1={PAD_L} y1={y + ROW_H - 10} x2={W - 30} y2={y + ROW_H - 10} stroke="#d0d0d8" />
      {children}
    </g>
  );
}

function Operator({ y, symbol }: { y: number; symbol: string }) {
  return (
    <text x={PAD_L - 34} y={y + 8} className="operator">
      {symbol}
    </text>
  );
}

function FormantMarker({
  x,
  y,
  label,
  faint,
}: {
  x: number;
  y: number;
  label: string;
  faint?: boolean;
}) {
  return (
    <g>
      <line
        x1={x}
        y1={y + 20}
        x2={x}
        y2={y + ROW_H - 10}
        stroke={faint ? "#f0a" : "#dc2626"}
        strokeOpacity={faint ? 0.25 : 0.4}
        strokeDasharray="3 3"
      />
      <text x={x} y={y + 18} className="formant-tag">
        {label}
      </text>
    </g>
  );
}

function envelopePath(
  envAt: (f: number) => number,
  xOf: (f: number) => number,
  yTop: number,
  fmax: number,
  step: number
): string {
  const yBase = yTop + ROW_H - 10;
  const pts: string[] = [];
  for (let f = step; f <= fmax; f += step) {
    const yy = yBase - envAt(f) * (ROW_H - 30);
    pts.push(`${xOf(f).toFixed(1)},${yy.toFixed(1)}`);
  }
  return "M " + pts.join(" L ");
}
