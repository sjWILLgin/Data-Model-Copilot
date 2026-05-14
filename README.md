# 智能中间层建模工作台

ModelFlow / Data Model Copilot

本项目为私有专有软件，包含前端原型、后端服务、AI 提示词模板和产品文档。

Copyright (c) 2026 will（水金）. All rights reserved.

未经书面授权，不得复制、分发、商用或二次开发。

## 本地启动

```bash
npm install
cp .env.example .env
npm run dev:server
npm run dev
```

前端默认运行在 `http://localhost:5173`，后端默认运行在 `http://localhost:8787`。

## 大模型配置

不要把真实 API Key 提交到 GitHub。

可选配置方式：

- 在前端 `AI 全局配置` 中录入供应商、Base URL、API Key，并点击 `测试连通性`。
- 或者在本地 `.env` 中填写环境变量，例如 `DASHSCOPE_API_KEY`、`OPENAI_API_KEY`、`DEEPSEEK_API_KEY`。

`.env` 已被 `.gitignore` 排除。仓库只保留 `.env.example`，其他开发者需要复制后填自己的 Key。

当前前端录入 Key 适合本地原型和演示。正式对外产品建议改为后端加密存储或接入 KMS / Vault / Secret Manager，前端只展示脱敏 Key。
