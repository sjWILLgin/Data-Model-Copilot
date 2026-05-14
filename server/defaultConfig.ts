/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import type { AiConfig, AiTaskKey, PromptName } from "./types.js";

export const promptToAiTask: Record<PromptName, AiTaskKey> = {
  table_semantic: "semantic",
  field_semantic: "semantic",
  model_recommendation: "reasoning",
  field_mapping: "mapping",
  question_review: "mapping",
  sql_generation: "sql",
  prd_generation: "document"
};

export const defaultAiConfig: AiConfig = {
  providers: [
    {
      id: "qwen",
      name: "通义千问",
      type: "OpenAI Compatible",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKeyRef: "DASHSCOPE_API_KEY",
      enabled: true
    },
    {
      id: "openai",
      name: "OpenAI",
      type: "OpenAI Compatible",
      baseUrl: "https://api.openai.com/v1",
      apiKeyRef: "OPENAI_API_KEY",
      enabled: false
    }
  ],
  taskModels: {
    semantic: { providerId: "qwen", model: "qwen-plus" },
    reasoning: { providerId: "qwen", model: "qwq-plus" },
    mapping: { providerId: "qwen", model: "qwq-plus" },
    sql: { providerId: "qwen", model: "qwen3-max" },
    document: { providerId: "qwen", model: "qwen3-max" },
    review: { providerId: "qwen", model: "qwq-plus" }
  },
  strategy: "标准模式",
  uncertaintyPolicy: "不确定即标注疑问",
  maxRounds: 3,
  temperature: 0.2
};
