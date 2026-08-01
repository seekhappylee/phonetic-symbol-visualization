import SourceFilterFigure from "../components/SourceFilterFigure";

/**
 * Theory page (dev doc §7): builds the "source-filter" mental model before
 * practice, so the F1-F2 point on the practice page reads as "the measurement
 * result of this very process".
 */
export default function TheoryPage() {
  return (
    <div className="page theory-page">
      <h2>发音的声学原理：声源 — 滤波器模型</h2>
      <p className="lead">
        为什么同一个人发不同元音，音色差别这么大？关键不在声带，而在
        <b>声道（口腔）的形状</b>。理解下面这条链路，你就能看懂练习页上那个 F1–F2 点的含义。
      </p>

      <div className="figure-block">
        <SourceFilterFigure />
      </div>

      <ol className="theory-steps">
        <li>
          <b>声源（Source）：</b>
          声带周期性开合，把气流斩成一串脉冲，产生
          <b>基频 F0</b> 及其一系列<b>谐波</b>——像一把等间距、能量平滑下降的“梳子”。
          <i>不同元音的声源几乎相同。</i>
        </li>
        <li>
          <b>滤波器（Filter）：</b>
          声道是一个共鸣腔，会<b>放大</b>靠近其共振频率的谐波、<b>压制</b>其余谐波，
          由此形成两个突起——<b>共振峰 F1、F2</b>。
        </li>
        <li>
          <b>相乘（×）：</b>
          谐波梳子 × 共振峰包络 = 我们真正听到的元音频谱。F1、F2 附近的谐波被顶高（图中红色），
          其余被压低（灰色）。
        </li>
        <li>
          <b>区分元音：</b>
          改变舌、唇、颌的位置 = 改变共鸣腔形状 = 移动 F1、F2。
          <b>F1 关联舌位高低（开口度）</b>，<b>F2 关联舌位前后</b>。
        </li>
        <li>
          <b>呼应练习：</b>
          你在练习页 F1–F2 图上的那个点，正是这条链路第 ③ 步的<b>测量结果</b>。
          点偏了，说明共鸣腔形状偏了——于是能反推出舌位该怎么调整。
        </li>
      </ol>

      <div className="callout">
        <b>记住这句话：</b>「测出 F1/F2 → 打在参考图上 → 与标准英音靶心对照 →
        把抽象的舌位偏差变成可见、可纠正的反馈。」这就是本系统的核心价值。
      </div>
    </div>
  );
}
