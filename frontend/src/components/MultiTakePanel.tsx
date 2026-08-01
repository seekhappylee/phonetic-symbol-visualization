import type { AnalyzeResponse, Take } from "../types";
import { QUALITY_LABELS } from "../types";

interface Props {
  result: AnalyzeResponse;
  excluded: Set<number>;
  onToggleExclude: (index: number) => void;
}

/**
 * Multi-take result panel: lists each pass (F1/F2/duration/quality), the group
 * center + spread, and each take's distance to the target. Low-quality takes are
 * flagged and excluded from stats; the user can also manually exclude any take.
 */
export default function MultiTakePanel({ result, excluded, onToggleExclude }: Props) {
  const { takes, summary } = result;

  return (
    <div className="take-panel">
      <h3>分遍结果（共 {takes.length} 遍）</h3>

      {result.warnings.length > 0 && (
        <ul className="warnings">
          {result.warnings.map((w, i) => (
            <li key={i}>⚠️ {w}</li>
          ))}
        </ul>
      )}

      <table className="take-table">
        <thead>
          <tr>
            <th>#</th>
            <th>质量</th>
            <th>F1</th>
            <th>F2</th>
            <th>F3</th>
            <th>F0</th>
            <th>时长</th>
            <th>距靶心</th>
            <th>计入统计</th>
          </tr>
        </thead>
        <tbody>
          {takes.map((t) => (
            <TakeRow
              key={t.index}
              take={t}
              excluded={excluded.has(t.index)}
              onToggle={() => onToggleExclude(t.index)}
            />
          ))}
        </tbody>
      </table>

      <div className="summary-box">
        <h4>整组统计（{summary.valid_count} 遍有效）</h4>
        {summary.valid_count > 0 ? (
          <div className="summary-grid">
            <Stat label="F1 中心" value={fmt(summary.f1_center)} unit="Hz" />
            <Stat label="F2 中心" value={fmt(summary.f2_center)} unit="Hz" />
            <Stat label="F1 散布 (SD)" value={fmt(summary.f1_spread)} unit="Hz" />
            <Stat label="F2 散布 (SD)" value={fmt(summary.f2_spread)} unit="Hz" />
            <Stat
              label="平均距靶心"
              value={fmt(summary.mean_distance_to_target)}
              unit="Hz"
            />
          </div>
        ) : (
          <p className="muted">暂无有效遍可统计。请调整发音或重新录音。</p>
        )}
      </div>

      {/* Per-take hints */}
      {takes.some((t) => t.hint) && (
        <div className="hints">
          <h4>发音提示</h4>
          <ul>
            {takes
              .filter((t) => t.hint && t.quality === "ok")
              .map((t) => (
                <li key={t.index}>
                  <b>第 {t.index} 遍：</b>
                  {t.hint}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TakeRow({
  take,
  excluded,
  onToggle,
}: {
  take: Take;
  excluded: boolean;
  onToggle: () => void;
}) {
  const ok = take.quality === "ok";
  return (
    <tr className={ok ? (excluded ? "excluded" : "") : "bad"}>
      <td>{take.index}</td>
      <td>
        <span className={`q-badge q-${take.quality}`}>{QUALITY_LABELS[take.quality]}</span>
      </td>
      <td>{fmt(take.f1)}</td>
      <td>{fmt(take.f2)}</td>
      <td>{fmt(take.f3)}</td>
      <td>{fmt(take.f0)}</td>
      <td>{(take.duration_ms / 1000).toFixed(2)}s</td>
      <td>{fmt(take.distance_to_target)}</td>
      <td>
        {ok ? (
          <input type="checkbox" checked={!excluded} onChange={onToggle} title="计入统计" />
        ) : (
          <span className="muted">—</span>
        )}
      </td>
    </tr>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">
        {value}
        {value !== "—" && <span className="stat-unit"> {unit}</span>}
      </span>
    </div>
  );
}

function fmt(n: number | null | undefined): string {
  return n == null ? "—" : String(Math.round(n));
}
