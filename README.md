# 英音发音辅助学习系统 (English Vowel Trainer)

本地部署的 Web 应用，帮助学习者练习英式英语（RP，DJ / Gimson 体系）单元音发音。浏览器端录音 → 后端用
[praat-parselmouth](https://github.com/YannickJadoul/Parselmouth) 做共振峰（formant）声学分析 →
在 **F1–F2 反向坐标图**上把用户发音与标准英音靶心对照，把抽象的舌位偏差变成可见、可纠正的反馈。

> 详细设计见 `英音发音学习系统-开发文档.md`。

## 架构

```
浏览器 (Web Audio API 采集录音)  →  FastAPI 后端 (ffmpeg 转码 + parselmouth 分析)  →  返回多遍 F1/F2 + 统计
```

**关键约束**：音频输入必须由浏览器负责，后端不直接访问麦克风（WSL 对音频硬件访问不友好）。

## 系统依赖

| 依赖 | 用途 | 安装 (Debian/Ubuntu/WSL) |
|---|---|---|
| Python ≥ 3.11 | 后端 | 系统自带或 `uv python install` |
| [uv](https://docs.astral.sh/uv/) | Python 环境/依赖管理 | `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| **ffmpeg** | 浏览器 webm/opus → wav 转码 | `sudo apt install ffmpeg` |
| Node ≥ 18 + npm | 前端 | `sudo apt install nodejs npm` 或 nvm |
| build-essential | 仅当 parselmouth 需编译时 | `sudo apt install build-essential` |

> parselmouth 在 Linux 通常有预编译 wheel，`uv sync` 一般直接装上。
> **ffmpeg 未安装时**：仍可分析浏览器直接上传的 WAV/PCM；webm/opus 录音会返回明确的错误提示（见 `/api/health`）。

## 快速开始

### 后端

```bash
cd backend
uv sync                       # 创建 venv 并按 uv.lock 安装依赖
cp config.example.toml config.toml   # 可选：按需改参数
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

- 健康检查 / 环境自检：`GET http://localhost:8000/api/health`
- 参考数据：`GET http://localhost:8000/api/vowels`
- 交互式 API 文档：`http://localhost:8000/docs`

### 前端

```bash
cd frontend
npm install
npm run dev                   # Vite dev server，默认 http://localhost:5173
```

开发形态前后端分离（Vite dev server + FastAPI，CORS 已放通本地）。前端通过 `VITE_API_BASE`
（默认 `http://localhost:8000`）访问后端。

### 单容器形态（可选）

前端 `npm run build` 产出 `frontend/dist` 后，设置环境变量
`VOWEL_TRAINER_FRONTEND_DIST=/abs/path/to/frontend/dist`，后端会直接托管该静态目录，
单进程即可运行整个应用（为后期 Docker 打包预留，见开发文档 §9）。

## 配置（外部化）

所有可调参数走环境变量或 `config.toml`（见 `backend/config.example.toml`），不硬编码。
环境变量以 `VOWEL_TRAINER_` 为前缀，优先级高于配置文件。关键项：

- 参考数据路径、性别基准（male/female）
- 共振峰频率上限（男 ~5000Hz / 女 ~5500Hz）
- 遍间静音阈值（~400ms）、最短有效时长（~100ms）、能量阈值策略
- 稳态中段窗口比例、CORS 来源

## 参考数据来源

`backend/app/data/vowels_rp.json` 的靶心/散布数值取自权威语音学文献，**非凭记忆编造**：

> Deterding, D. (1997). *The Formants of Monophthong Vowels in Standard Southern British English
> Pronunciation.* Journal of the International Phonetic Association, 27, 47–55.

- `f1_mean`/`f2_mean`：Table 2 的均值（连续语流，MARSEC/BBC 播音员）。
- `f1_sd`/`f2_sd`：由论文附录 A1/A2 的 5 位男/女说话人各自均值计算的**说话人间标准差**，用于画可接受范围椭圆。
- 性别差异显著，数据按 male/female 分别存储；默认基准可配置。
- Deterding (1997) 只测量 11 个单元音，**不含弱读央元音 /ə/**；/ə/ 在数据中标记为无文献参考值，前端优雅占位。

生成脚本：`backend/app/data/generate_vowels_rp.py`（内含论文原始逐说话人数据，可复算）。
