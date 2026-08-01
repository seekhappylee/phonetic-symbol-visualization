import { QUAD_POSITIONS, vowelColor } from "../data/vowels";

interface Props {
  highlightId?: string | null;
  onPickVowel?: (id: string) => void;
}

const W = 560;
const H = 460;
// Trapezoid corners (top wider than bottom = the classic IPA vowel quadrilateral).
const TL = { x: 90, y: 40 }; // front-close
const TR = { x: 500, y: 40 }; // back-close
const BL = { x: 200, y: 400 }; // front-open
const BR = { x: 470, y: 400 }; // back-open

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Map (frontness, height) into the trapezoid: rows narrow toward the bottom.
function place(frontness: number, height: number) {
  const leftX = lerp(TL.x, BL.x, height);
  const rightX = lerp(TR.x, BR.x, height);
  const y = lerp(TL.y, BL.y, height);
  const x = lerp(leftX, rightX, frontness);
  return { x, y };
}

/**
 * The IPA vowel quadrilateral (articulatory layer): a static map of the 12 RP
 * monophthongs by tongue frontness (x) and height (y). Serves as the "action
 * guide" that visually parallels the reversed-axis F1-F2 acoustic chart.
 */
export default function IpaQuadrilateral({ highlightId, onPickVowel }: Props) {
  const outline = `${TL.x},${TL.y} ${TR.x},${TR.y} ${BR.x},${BR.y} ${BL.x},${BL.y}`;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="ipa-quad" role="img">
        <polygon points={outline} fill="#fbfbfd" stroke="#c7c7d0" strokeWidth={1.5} />

        {/* dimension labels */}
        <text x={(TL.x + TR.x) / 2} y={24} className="axis-label">
          舌位前后：前 ← → 后
        </text>
        <text x={20} y={H / 2} className="axis-label" transform={`rotate(-90 20 ${H / 2})`}>
          舌位高低：高（闭）↑ ↓ 低（开）
        </text>
        <text x={TL.x - 8} y={TL.y - 6} className="corner">前</text>
        <text x={TR.x + 2} y={TR.y - 6} className="corner">后</text>

        {/* two intermediate height guides (close-mid / open-mid) */}
        {[0.33, 0.66].map((h) => {
          const l = place(0, h);
          const r = place(1, h);
          return (
            <line key={h} x1={l.x} y1={l.y} x2={r.x} y2={r.y} stroke="#ecedf2" />
          );
        })}

        {QUAD_POSITIONS.map((v) => {
          const p = place(v.frontness, v.height);
          const active = v.id === highlightId;
          const color = vowelColor(v.id);
          return (
            <g
              key={v.id}
              onClick={() => onPickVowel?.(v.id)}
              style={{ cursor: onPickVowel ? "pointer" : "default" }}
            >
              {active && <circle cx={p.x} cy={p.y} r={16} fill={color} fillOpacity={0.18} />}
              <circle cx={p.x} cy={p.y} r={active ? 6 : 4} fill={color} />
              <text
                x={p.x + (v.frontness > 0.6 ? 9 : -9)}
                y={p.y + 5}
                textAnchor={v.frontness > 0.6 ? "start" : "end"}
                className={active ? "vowel-label target" : "vowel-label"}
                fill={color}
              >
                {v.ipa}
                {v.rounded ? "°" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="hint-note">
        小圆点 = 标准舌位；标 <b>°</b> 者为圆唇元音。此图为“动作指导”，与右侧 F1–F2 声学图形状对应。
      </p>
    </div>
  );
}
