# Docker（预留）

按开发文档 §9，**阶段一不写 Dockerfile**，仅遵守 §2.3 可容器化约束
（系统依赖清单化、配置外部化、前端可被后端托管）。后期按下述规格一次性补上：

- `Dockerfile`：基于官方 Python 镜像，用 uv 装依赖；**显式 `apt install ffmpeg`**；
  先拷 `pyproject.toml` + `uv.lock` 再拷代码以利用缓存；入口 `uvicorn app.main:app`。
- 前端 `vite build` 产出 `dist`，由 FastAPI 通过环境变量
  `VOWEL_TRAINER_GENERAL_FRONTEND_DIST` 指向并托管，单容器运行整个应用。
- `docker-compose.yml`：管理端口、卷挂载（示范音 / 参考数据 / 临时录音）、
  以及 §6.5 的全部配置项（经环境变量注入）。
