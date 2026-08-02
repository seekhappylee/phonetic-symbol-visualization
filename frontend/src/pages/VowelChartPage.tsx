import FormantChart from "../components/FormantChart";
import IpaQuadrilateral from "../components/IpaQuadrilateral";
import OverlayControls from "../components/OverlayControls";
import type { ReferenceOverlay, VowelsResponse } from "../types";

interface Props {
  data: VowelsResponse;
  selectedVowel: string | null;
  onSelectVowel: (id: string) => void;
  overlays: ReferenceOverlay[];
  enabledOverlays: Set<string>;
  onToggleOverlay: (id: string) => void;
}

/**
 * The two core charts side by side (dev doc §1.2): the IPA quadrilateral
 * (articulatory) and the reversed-axis F1-F2 chart (acoustic). Clicking a vowel
 * in either highlights it in both, making the shape correspondence explicit.
 */
export default function VowelChartPage({
  data,
  selectedVowel,
  onSelectVowel,
  overlays,
  enabledOverlays,
  onToggleOverlay,
}: Props) {
  const activeOverlays = overlays.filter((o) => enabledOverlays.has(o.id));
  return (
    <div className="page chart-page">
      <h2>两张元音图：舌位（发音） vs 共振峰（声学）</h2>
      <p className="lead">
        左图是教材经典的 <b>IPA 元音四边形</b>（动作指导）；右图是
        <b>F1–F2 共振峰图</b>（结果测量）。右图坐标<b>刻意反向</b>
        （F1 向下增、F2 向左增），因此两张图形状对应：
        <i>/iː/ 落左上，/ɑː/ 落右下，/uː/ 落右上</i>。选中一个元音在两图同时高亮。
      </p>

      <div className="vowel-picker">
        {data.vowels.map((v) => (
          <button
            key={v.id}
            className={`chip ${v.id === selectedVowel ? "active" : ""} ${
              v.has_reference ? "" : "no-ref"
            }`}
            onClick={() => onSelectVowel(v.id)}
            title={v.has_reference ? v.example_word : "无文献参考值"}
          >
            {v.ipa}
            <span className="chip-word">{v.example_word}</span>
          </button>
        ))}
      </div>

      <div className="two-charts">
        <figure>
          <figcaption>IPA 元音四边形（舌位）</figcaption>
          <IpaQuadrilateral highlightId={selectedVowel} onPickVowel={onSelectVowel} />
        </figure>
        <figure>
          <figcaption>F1–F2 共振峰图（声学，反向坐标）</figcaption>
          <OverlayControls
            overlays={overlays}
            enabled={enabledOverlays}
            onToggle={onToggleOverlay}
          />
          <FormantChart
            vowels={data.vowels}
            targetVowelId={selectedVowel}
            onPickVowel={onSelectVowel}
            overlays={activeOverlays}
          />
        </figure>
      </div>

      {selectedVowel && <SelectedInfo data={data} id={selectedVowel} />}

      <p className="source-line">主参考（靶心）：{data.source}</p>
      {activeOverlays.map((o) => (
        <p className="source-line" key={`src-${o.id}`}>
          对照数据集：{o.source}
        </p>
      ))}
    </div>
  );
}

function SelectedInfo({ data, id }: { data: VowelsResponse; id: string }) {
  const v = data.vowels.find((x) => x.id === id);
  if (!v) return null;
  return (
    <div className="selected-info">
      <span className="big-ipa">{v.ipa}</span>
      <span>
        例词 <b>{v.example_word}</b> · {v.type}
      </span>
      {v.has_reference ? (
        <span>
          靶心 F1=<b>{v.f1_mean}</b> Hz，F2=<b>{v.f2_mean}</b> Hz
          （SD ±{v.f1_sd} / ±{v.f2_sd}）
        </span>
      ) : (
        <span className="muted">{v.reference_note ?? "无文献参考值"}</span>
      )}
    </div>
  );
}
