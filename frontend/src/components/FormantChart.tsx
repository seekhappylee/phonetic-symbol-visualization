import { useMemo, useState } from "react";
import type { ReferenceOverlay, Summary, Take, VowelReference } from "../types";
import { vowelColor } from "../data/vowels";

interface Props {
  vowels: VowelReference[];
  targetVowelId: string | null;
  userTakes?: Take[];
  summary?: Summary | null;
  sdMultiplier?: number; // ellipse size in SD units (default 1.5)
  onPickVowel?: (id: string) => void;
  /** Secondary literature datasets to overlay for comparison (display-only). */
  overlays?: ReferenceOverlay[];
}

// Distinct glyph shapes cycled per overlay dataset (index order).
const OVERLAY_SHAPES = ["triangle", "diamond", "cross"] as const;
type OverlayShape = (typeof OVERLAY_SHAPES)[number];

const W = 660;
const H = 540;
const PAD = { top: 40, right: 30, bottom: 56, left: 64 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

interface Domain {
  f1min: number;
  f1max: number;
  f2min: number;
  f2max: number;
}

/**
 * The F1-F2 acoustic chart with DELIBERATELY REVERSED axes so its shape matches
 * the IPA quadrilateral (dev doc §1.2, a key teaching requirement):
 *   - F1 (vertical): increases DOWNWARD  -> low F1 (high vowels like /iː/) on top
 *   - F2 (horizontal): increases LEFTWARD -> high F2 (front vowels like /iː/) on left
 */
export default function FormantChart({
  vowels,
  targetVowelId,
  userTakes,
  summary,
  sdMultiplier = 1.5,
  onPickVowel,
  overlays = [],
}: Props) {
  const [hover, setHover] = useState<string | null>(null);

  const okTakes = useMemo(
    () => (userTakes ?? []).filter((t) => t.quality === "ok" && t.f1 != null),
    [userTakes]
  );

  // Only overlays that actually carry data for the current gender are drawn.
  const activeOverlays = useMemo(
    () => overlays.filter((o) => o.has_data && o.vowels.length > 0),
    [overlays]
  );

  const domain = useMemo<Domain>(() => {
    const f1s: number[] = [];
    const f2s: number[] = [];
    for (const v of vowels) {
      if (v.f1_mean != null && v.f2_mean != null) {
        const sd1 = (v.f1_sd ?? 0) * sdMultiplier;
        const sd2 = (v.f2_sd ?? 0) * sdMultiplier;
        f1s.push(v.f1_mean - sd1, v.f1_mean + sd1);
        f2s.push(v.f2_mean - sd2, v.f2_mean + sd2);
      }
      if (v.demo_f1 != null && v.demo_f2 != null) {
        f1s.push(v.demo_f1);
        f2s.push(v.demo_f2);
      }
    }
    for (const t of okTakes) {
      f1s.push(t.f1 as number);
      f2s.push(t.f2 as number);
    }
    for (const o of activeOverlays) {
      for (const v of o.vowels) {
        if (v.f1_mean != null && v.f2_mean != null) {
          f1s.push(v.f1_mean);
          f2s.push(v.f2_mean);
        }
      }
    }
    const f1min = Math.min(180, ...f1s) - 30;
    const f1max = Math.max(1100, ...f1s) + 30;
    const f2min = Math.min(700, ...f2s) - 60;
    const f2max = Math.max(2700, ...f2s) + 60;
    return { f1min, f1max, f2min, f2max };
  }, [vowels, okTakes, activeOverlays, sdMultiplier]);

  const x = (f2: number) =>
    PAD.left + ((domain.f2max - f2) / (domain.f2max - domain.f2min)) * PLOT_W;
  const y = (f1: number) =>
    PAD.top + ((f1 - domain.f1min) / (domain.f1max - domain.f1min)) * PLOT_H;
  const sx = PLOT_W / (domain.f2max - domain.f2min);
  const sy = PLOT_H / (domain.f1max - domain.f1min);

  // Gridlines (reversed tick labels).
  const f2ticks = niceTicks(domain.f2min, domain.f2max, 6);
  const f1ticks = niceTicks(domain.f1min, domain.f1max, 6);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="formant-chart" role="img">
        {/* plot background */}
        <rect
          x={PAD.left}
          y={PAD.top}
          width={PLOT_W}
          height={PLOT_H}
          fill="#fbfbfd"
          stroke="#d0d0d8"
        />

        {/* gridlines + ticks */}
        {f2ticks.map((t) => (
          <g key={`f2-${t}`}>
            <line x1={x(t)} y1={PAD.top} x2={x(t)} y2={PAD.top + PLOT_H} stroke="#ecedf2" />
            <text x={x(t)} y={PAD.top + PLOT_H + 18} className="tick">
              {t}
            </text>
          </g>
        ))}
        {f1ticks.map((t) => (
          <g key={`f1-${t}`}>
            <line x1={PAD.left} y1={y(t)} x2={PAD.left + PLOT_W} y2={y(t)} stroke="#ecedf2" />
            <text x={PAD.left - 10} y={y(t) + 4} className="tick" textAnchor="end">
              {t}
            </text>
          </g>
        ))}

        {/* axis labels — arrows show the reversed direction of increase */}
        <text x={PAD.left + PLOT_W / 2} y={H - 14} className="axis-label">
          ← F2 (Hz) 增大　（前元音）
        </text>
        <text
          x={16}
          y={PAD.top + PLOT_H / 2}
          className="axis-label"
          transform={`rotate(-90 16 ${PAD.top + PLOT_H / 2})`}
        >
          ↓ F1 (Hz) 增大　（低元音 / 开口大）
        </text>

        {/* target centroids + acceptance ellipses (literature bullseyes) */}
        {vowels.map((v) => {
          if (v.f1_mean == null || v.f2_mean == null) return null;
          const cx = x(v.f2_mean);
          const cy = y(v.f1_mean);
          const rx = (v.f2_sd ?? 0) * sdMultiplier * sx;
          const ry = (v.f1_sd ?? 0) * sdMultiplier * sy;
          const isTarget = v.id === targetVowelId;
          const isHover = v.id === hover;
          const color = vowelColor(v.id);
          return (
            <g
              key={v.id}
              onMouseEnter={() => setHover(v.id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPickVowel?.(v.id)}
              style={{ cursor: onPickVowel ? "pointer" : "default" }}
            >
              {rx > 0 && ry > 0 && (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={rx}
                  ry={ry}
                  fill={color}
                  fillOpacity={isTarget ? 0.16 : 0.07}
                  stroke={color}
                  strokeOpacity={isTarget ? 0.9 : 0.35}
                  strokeWidth={isTarget ? 2 : 1}
                  strokeDasharray={isTarget ? undefined : "4 3"}
                />
              )}
              <circle cx={cx} cy={cy} r={isTarget || isHover ? 5 : 3.5} fill={color} />
              <text
                x={cx + 8}
                y={cy - 6}
                className={isTarget ? "vowel-label target" : "vowel-label"}
                fill={color}
              >
                {v.ipa}
              </text>
            </g>
          );
        })}

        {/* secondary reference datasets (display-only): a connector from the
            primary bullseye to this dataset's centroid makes the drift visible */}
        {activeOverlays.map((o, oi) => {
          const shape = OVERLAY_SHAPES[oi % OVERLAY_SHAPES.length];
          return (
            <g key={`ov-${o.id}`}>
              {o.vowels.map((ov) => {
                if (ov.f1_mean == null || ov.f2_mean == null) return null;
                const color = vowelColor(ov.id);
                const ox = x(ov.f2_mean);
                const oy = y(ov.f1_mean);
                const prim = vowels.find((v) => v.id === ov.id);
                const dim = hover != null && hover !== ov.id;
                return (
                  <g key={`ov-${o.id}-${ov.id}`} opacity={dim ? 0.25 : 1}>
                    {prim?.f1_mean != null && prim?.f2_mean != null && (
                      <line
                        x1={x(prim.f2_mean)}
                        y1={y(prim.f1_mean)}
                        x2={ox}
                        y2={oy}
                        stroke={color}
                        strokeOpacity={0.4}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                    )}
                    <OverlayGlyph shape={shape} cx={ox} cy={oy} color={color} />
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* demonstration points (real reference speaker), if available */}
        {vowels.map((v) =>
          v.demo_f1 != null && v.demo_f2 != null ? (
            <g key={`demo-${v.id}`}>
              <rect
                x={x(v.demo_f2) - 4}
                y={y(v.demo_f1) - 4}
                width={8}
                height={8}
                fill="none"
                stroke={vowelColor(v.id)}
                strokeWidth={2}
                transform={`rotate(45 ${x(v.demo_f2)} ${y(v.demo_f1)})`}
              />
            </g>
          ) : null
        )}

        {/* user takes + center + spread ellipse */}
        {summary && summary.valid_count > 0 && summary.f1_center != null && (
          <ellipse
            cx={x(summary.f2_center as number)}
            cy={y(summary.f1_center as number)}
            rx={Math.max((summary.f2_spread ?? 0) * sx, 2)}
            ry={Math.max((summary.f1_spread ?? 0) * sy, 2)}
            fill="#111"
            fillOpacity={0.06}
            stroke="#111"
            strokeOpacity={0.5}
            strokeDasharray="2 2"
          />
        )}
        {okTakes.map((t) => (
          <g key={`take-${t.index}`}>
            <circle cx={x(t.f2 as number)} cy={y(t.f1 as number)} r={6} fill="#111" />
            <text
              x={x(t.f2 as number)}
              y={y(t.f1 as number) + 3.5}
              className="take-index"
            >
              {t.index}
            </text>
          </g>
        ))}
        {summary && summary.valid_count > 0 && summary.f1_center != null && (
          <circle
            cx={x(summary.f2_center as number)}
            cy={y(summary.f1_center as number)}
            r={4}
            fill="#fff"
            stroke="#111"
            strokeWidth={2}
          />
        )}
      </svg>

      <Legend
        hasUser={okTakes.length > 0}
        hasDemo={vowels.some((v) => v.demo_f1 != null)}
        overlays={activeOverlays}
      />
    </div>
  );
}

/** A small SVG glyph marking one overlay dataset's vowel centroid. */
function OverlayGlyph({
  shape,
  cx,
  cy,
  color,
  r = 5,
}: {
  shape: OverlayShape;
  cx: number;
  cy: number;
  color: string;
  r?: number;
}) {
  const common = { fill: "none", stroke: color, strokeWidth: 2 };
  if (shape === "triangle") {
    const pts = `${cx},${cy - r} ${cx - r},${cy + r * 0.8} ${cx + r},${cy + r * 0.8}`;
    return <polygon points={pts} {...common} />;
  }
  if (shape === "diamond") {
    const pts = `${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`;
    return <polygon points={pts} {...common} />;
  }
  // cross
  return (
    <g stroke={color} strokeWidth={2}>
      <line x1={cx - r} y1={cy - r} x2={cx + r} y2={cy + r} />
      <line x1={cx - r} y1={cy + r} x2={cx + r} y2={cy - r} />
    </g>
  );
}

function Legend({
  hasUser,
  hasDemo,
  overlays,
}: {
  hasUser: boolean;
  hasDemo: boolean;
  overlays: ReferenceOverlay[];
}) {
  return (
    <div className="legend">
      <span className="legend-item">
        <span className="swatch target" /> 文献靶心 + 可接受范围椭圆
      </span>
      <span className="legend-item">
        <span className="swatch demo" /> 示范音点{hasDemo ? "" : "（暂无）"}
      </span>
      <span className="legend-item">
        <span className="swatch user" /> 你的每遍（编号）
      </span>
      {hasUser && (
        <span className="legend-item">
          <span className="swatch center" /> 你的中心 + 散布
        </span>
      )}
      {overlays.map((o, oi) => (
        <span className="legend-item" key={`lg-${o.id}`}>
          <svg width={16} height={16} className="legend-glyph" aria-hidden>
            <OverlayGlyph
              shape={OVERLAY_SHAPES[oi % OVERLAY_SHAPES.length]}
              cx={8}
              cy={8}
              color="#555"
              r={5}
            />
          </svg>
          {o.label}
          {o.statistic === "median" ? "（中位数）" : ""}
        </span>
      ))}
    </div>
  );
}

function niceTicks(min: number, max: number, count: number): number[] {
  const raw = (max - min) / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const start = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let t = start; t <= max; t += step) ticks.push(Math.round(t));
  return ticks;
}
