import { useState } from "react";

/**
 * Collapsible guidance on choosing the steady-state window. Different steady
 * windows on the same clip can yield noticeably different formants, so this
 * explains how to pick a stable, representative window.
 */
export default function SteadyStateHelp() {
  const [open, setOpen] = useState(false);
  return (
    <div className="steady-help">
      <button
        type="button"
        className="btn ghost tiny"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "▾" : "▸"} 如何选择稳态段？
      </button>
      {open && (
        <div className="steady-help-panel">
          <p>
            <b>稳态段</b>＝元音中间「舌位不动、共振峰基本水平」的一小段。取不同的段，F1/F2
            会明显不同，所以要选得稳、选得准：
          </p>
          <ol>
            <li>
              <b>取中间，弃两头</b>：避开起始的滑入和结尾的滑出（也避开前后辅音），
              通常取元音时长的中间 40%–60%。
            </li>
            <li>
              <b>找水平段</b>：把横轴放大后，选 F1/F2 看起来最平、不上下滑动的一段；
              明显滑动往往是双元音化或协同发音，不算单元音稳态。
            </li>
            <li>
              <b>够长但别贪</b>：约 40–80ms 即可（本工具最少 30ms）；太短易受噪声影响，
              太长会把过渡段也算进来。
            </li>
            <li>
              <b>避开杂音与破音</b>：气声、爆破、咔哒声、换气都要排除在绿色稳态框外。
            </li>
            <li>
              <b>多遍取一致</b>：同一元音录几遍，选各遍相似位置；若某遍偏差大，宁可弃掉。
            </li>
          </ol>
          <p className="muted">
            小技巧：先用「▶ 稳态」试听绿色框，应当听到一个干净、稳定、无滑动的元音；
            拉长横轴能让你把绿框收得更精确。
          </p>
        </div>
      )}
    </div>
  );
}
