# CLAUDE.md — 英音发音辅助学习系统

本地部署的 Web 应用：练习英式英语（RP，DJ/Gimson 体系）**单元音**发音。浏览器录音 →
后端用 praat-parselmouth 做共振峰分析 → 在**反向坐标** F1–F2 图上把用户发音与标准靶心对照，
把抽象的舌位偏差变成可见、可纠正的反馈。仅英音 RP，不涉及美音。

## 开发命令

```bash
# 后端（FastAPI + parselmouth，uv 管理）
cd backend && uv sync
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
#   /api/health 自检、/docs 交互文档

# 前端（Vite + React + TS）
cd frontend && npm install && npm run dev      # http://localhost:5173
npm run build                                   # tsc -b && vite build → dist/
npx tsc --noEmit                                # 仅类型检查

# 单容器：VOWEL_TRAINER_FRONTEND_DIST=/abs/frontend/dist 让后端托管静态前端
```

前后端分离开发，前端经 `VITE_API_BASE`（默认 `http://localhost:8000`）访问后端。

## 架构地图

**后端 `backend/app/`**
- `main.py` — FastAPI 路由 + 可选静态前端托管
- `config.py` — 外部化配置（`config.toml` / `VOWEL_TRAINER_*` 环境变量；**不硬编码**分析参数）
- `audio.py` — 上传解码（native WAV 直读；webm/opus 走 ffmpeg 转码）
- `segmentation.py` — VAD 分遍（峰值驱动浊音阈值）+ 稳态窗口
- `analysis.py` — formant track / 采样 / F0
- `quality.py` — 每遍质量判定（QC）
- `pipeline.py` — 编排：录音 → 分遍 → 稳态 → F0/F1/F2/F3 → QC → 统计
- `reference.py` — 加载文献靶心（Deterding）、叠加数据集、距离/舌位提示
- `reference_sets.py` — 用户自建标准音库的持久化 CRUD + 单元音分析 + 作靶心
- `data/vowels_rp.json`（由 `generate_vowels_rp.py` 生成）、`data/overlays/*.json`

**前端 `frontend/src/`**
- `App.tsx` — 壳：4 个标签页、性别基准、拉取 vowels/overlays/sets
- `pages/` — `TheoryPage` ① / `VowelChartPage` ② / `PracticePage` ③ / `StandardLibraryPage` ④
- `components/` — `FormantChart`（反向坐标 F1–F2 图）、`IpaQuadrilateral`、`Recorder`、
  `WaveformEditor`（切片/稳态/**横轴缩放**）、`SteadyStateHelp`、`VowelClipEditor`、
  `OverlayControls`、`MultiTakePanel`
- `data/vowels.ts`（IPA 四边形位置 + 每元音配色）、`data/referenceSet.ts`（set→图靶心映射）
- `api/client.ts`、`types.ts`（镜像后端 Pydantic 模型）

## 关键领域概念

- **反向坐标**：F1 向下增（低元音在下）、F2 向左增（前元音在左），使 F1–F2 图形状与 IPA
  四边形对应（`/iː/` 左上、`/ɑː/` 右下、`/uː/` 右上）。核心教学要求，改图时勿破坏。
- **稳态段**：实际测量的是元音中段「共振峰水平」的一小段；取段不同 F1/F2 会明显不同。
- **三层参考数据**（务必区分）：
  1. **文献靶心（主）**：`vowels_rp.json` = Deterding (1997)，男/女均值 + 说话人间 SD 椭圆，
     **驱动默认评分**（距离、舌位提示）。
  2. **叠加数据集（对照，不评分）**：`data/overlays/*.json`，如 Ferragne (2010) 伦敦男声；
     图上以不同标记 + 从主靶心画虚线显示漂移。接口 `/api/reference-overlays`。
  3. **用户标准音库（可作靶心）**：用户自录一套，`/api/reference-sets*`；选中后**替换**文献
     成为评分靶心，可回放示范音。持久化在 `backend/data/reference_sets/<id>/`（已 gitignore）。

## 硬约束 / 约定

- **参考共振峰数值只誊抄权威文献原表，绝不凭记忆编造**（开发文档 §5.2、README 均强调）。
- 分析相关参数一律走 `config.py`，模块内不硬编码；同一镜像跨环境可用。
- 用户录音在浏览器采集，后端从不碰麦克风；用户运行时数据（`data/reference_sets/`）不入库。
- 更多文献与多数据集数值对照见仓库根目录 `references/`（含 PDF、原始数据、对照 README）。

## 现状（截至 2026-08）

功能 ①②③④ 均可跑通：文献靶心对照、透明分遍波形编辑（切片/稳态/横轴缩放/稳态选择提醒）、
叠加对照数据集、用户自建标准音库（录音/上传 → 逐元音切片选稳态 → 命名选性别 → 作靶心并回放）。
数值来源忠实于 Deterding (1997) Table 2（已核对）。改动尚未提交（未 commit）。
