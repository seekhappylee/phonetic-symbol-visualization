import type { ReferenceOverlay } from "../types";

interface Props {
  overlays: ReferenceOverlay[];
  enabled: Set<string>;
  onToggle: (id: string) => void;
}

/**
 * Toggles for secondary literature datasets overlaid on the F1-F2 chart. These
 * are display-only comparisons (they never change the primary bullseyes used for
 * scoring). A dataset with no data for the current gender is shown disabled.
 */
export default function OverlayControls({ overlays, enabled, onToggle }: Props) {
  if (overlays.length === 0) return null;
  return (
    <div className="overlay-controls">
      <span className="overlay-controls-label">对照数据集：</span>
      {overlays.map((o) => {
        const disabled = !o.has_data;
        const on = enabled.has(o.id) && !disabled;
        return (
          <label
            key={o.id}
            className={`overlay-chip ${on ? "on" : ""} ${disabled ? "disabled" : ""}`}
            title={
              disabled
                ? `${o.source}\n\n（该数据集无当前性别的数据）`
                : `${o.source}${o.note ? "\n\n" + o.note : ""}`
            }
          >
            <input
              type="checkbox"
              checked={on}
              disabled={disabled}
              onChange={() => onToggle(o.id)}
            />
            {o.label}
            {disabled ? "（无当前性别数据）" : ""}
          </label>
        );
      })}
    </div>
  );
}
