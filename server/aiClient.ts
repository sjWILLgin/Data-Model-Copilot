/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import { defaultAiConfig, promptToAiTask } from "./defaultConfig.js";
import { buildMockAiResult } from "./mockAi.js";
import { buildPromptBundle } from "./promptRegistry.js";
import { hashText, redactSecrets, writeTraceLog, writeTraceSnapshot } from "./traceLogger.js";
import type { AiConfig, Field, PromptName, PromptRequest, SourceTable } from "./types.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function runPrompt(promptName: PromptName, request: PromptRequest, options: { signal?: AbortSignal } = {}) {
  const traceId = `${promptName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const aiConfig = mergeAiConfig(request.aiConfig);
  const taskKey = promptToAiTask[promptName];
  const taskModel = aiConfig.taskModels[taskKey];
  const provider = aiConfig.providers.find((item) => item.id === taskModel.providerId) || aiConfig.providers.find((item) => item.enabled) || aiConfig.providers[0];
  const apiKey = getProviderApiKey(provider);
  const allowMock = process.env.ALLOW_MOCK_AI === "true";
  const context = compactPromptContext(promptName, {
    ...request,
    strategy: request.strategy || aiConfig.strategy,
    uncertaintyPolicy: request.uncertaintyPolicy || aiConfig.uncertaintyPolicy
  });
  const { messages, metadata } = await buildPromptBundle(promptName, context);

  writeAiTrace("start", {
    traceId,
    promptName,
    taskKey,
    provider: provider ? { id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl, enabled: provider.enabled, apiKeyRef: provider.apiKeyRef } : undefined,
    model: taskModel.model,
    temperature: aiConfig.temperature,
    mode: apiKey ? "live" : allowMock ? "mock" : "missing_api_key",
    prompt: {
      ...metadata,
      systemHash: hashText(messages[0]?.content || ""),
      userHash: hashText(messages[1]?.content || ""),
      detailFile: `ai-runs/${traceId}.start.json`,
      systemChars: messages[0]?.content.length || 0,
      userChars: messages[1]?.content.length || 0
    },
    contextSummary: summarizePromptContext(context)
  });
  writeAiSnapshot(`${traceId}.start.json`, {
    traceId,
    promptName,
    taskKey,
    provider: provider ? { id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl, enabled: provider.enabled, apiKeyRef: provider.apiKeyRef } : undefined,
    model: taskModel.model,
    temperature: aiConfig.temperature,
    prompt: {
      ...metadata,
      messages: redactSecrets(messages)
    },
    context: redactSecrets(context)
  });

  if (!provider || !apiKey) {
    if (!allowMock) {
      const error = `Missing API key for provider ${provider?.name || "unknown"} (${provider?.apiKeyRef || "no apiKeyRef"})`;
      writeAiTrace("error", {
        traceId,
        promptName,
        model: taskModel.model,
        durationMs: Date.now() - startedAt,
        error
      });
      throw new Error(error);
    }
    const result = buildMockAiResult(promptName, request);
    writeAiTrace("finish", {
      traceId,
      promptName,
      model: taskModel.model,
      mode: "mock",
      durationMs: Date.now() - startedAt,
      result: summarizeAiResult(result),
      detailFile: `ai-runs/${traceId}.finish.json`
    });
    writeAiSnapshot(`${traceId}.finish.json`, {
      traceId,
      promptName,
      model: taskModel.model,
      mode: "mock",
      durationMs: Date.now() - startedAt,
      result: redactSecrets(result)
    });
    return {
      mode: "mock",
      provider: provider?.name || "mock",
      model: taskModel.model,
      promptName,
      result
    };
  }

  try {
    const content = await callOpenAiCompatible({
      baseUrl: provider.baseUrl,
      apiKey,
      model: taskModel.model,
      messages,
      temperature: aiConfig.temperature,
      stream: isStreamOnlyReasoningModel(taskModel.model),
      signal: options.signal
    });
    const parsed = parseJsonContent(content);

    writeAiTrace("finish", {
      traceId,
      promptName,
      provider: provider.name,
      model: taskModel.model,
      mode: "live",
      durationMs: Date.now() - startedAt,
      result: summarizeAiResult(parsed),
      rawTextHash: hashText(content),
      rawTextChars: content.length,
      detailFile: `ai-runs/${traceId}.finish.json`
    });
    writeAiSnapshot(`${traceId}.finish.json`, {
      traceId,
      promptName,
      provider: provider.name,
      model: taskModel.model,
      mode: "live",
      durationMs: Date.now() - startedAt,
      result: redactSecrets(parsed),
      rawText: content
    });

    return {
      mode: "live",
      provider: provider.name,
      model: taskModel.model,
      promptName,
      result: parsed,
      rawText: content
    };
  } catch (error) {
    writeAiTrace("error", {
      traceId,
      promptName,
      provider: provider.name,
      model: taskModel.model,
      mode: "live",
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Unknown AI error"
    });
    throw error;
  }
}

export async function testAiProvider(input: { provider?: AiConfig["providers"][number]; model?: string; temperature?: number }) {
  const provider = input.provider;
  const apiKey = getProviderApiKey(provider);
  const model = input.model || "qwen-plus";
  if (!provider) {
    throw new Error("Missing provider config");
  }
  if (!apiKey) {
    throw new Error(`Missing API key for provider ${provider.name || provider.id} (${provider.apiKeyRef || "no apiKeyRef"})`);
  }
  const content = await callOpenAiCompatible({
    baseUrl: provider.baseUrl,
    apiKey,
    model,
    messages: [
      { role: "system", content: "You are a connectivity test endpoint. Return strict JSON only." },
      { role: "user", content: "Return {\"ok\":true,\"message\":\"connected\"}." }
    ],
    temperature: input.temperature ?? 0,
    stream: isStreamOnlyReasoningModel(model)
  });
  return {
    ok: true,
    provider: provider.name,
    model,
    keySource: provider.apiKey ? "frontend" : "environment",
    result: parseJsonContent(content)
  };
}

function mergeAiConfig(config?: AiConfig): AiConfig {
  if (!config) return defaultAiConfig;
  return {
    ...defaultAiConfig,
    ...config,
    providers: config.providers?.length ? config.providers : defaultAiConfig.providers,
    taskModels: { ...defaultAiConfig.taskModels, ...config.taskModels }
  };
}

function getProviderApiKey(provider?: AiConfig["providers"][number]) {
  return provider?.apiKey || (provider?.apiKeyRef ? process.env[provider.apiKeyRef] : "") || "";
}

function isStreamOnlyReasoningModel(model: string) {
  return /qwq/i.test(model);
}

async function callOpenAiCompatible(input: { baseUrl: string; apiKey: string; model: string; messages: ChatMessage[]; temperature: number; stream?: boolean; signal?: AbortSignal }) {
  const url = `${input.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${input.apiKey}`
    },
    body: JSON.stringify({
      model: input.model,
      messages: input.messages,
      temperature: input.temperature,
      response_format: { type: "json_object" },
      stream: Boolean(input.stream)
    }),
    signal: input.signal
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM request failed: ${response.status} ${errorText}`);
  }

  if (input.stream) {
    const content = await readStreamContent(response);
    if (!content) {
      throw new Error("LLM stream response missing content");
    }
    return content;
  }

  const json = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = json.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response missing choices[0].message.content");
  }
  return content;
}

async function readStreamContent(response: Response) {
  const text = await response.text();
  let content = "";
  text.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) return;
    const payload = trimmed.replace(/^data:\s*/, "");
    if (!payload || payload === "[DONE]") return;
    try {
      const chunk = JSON.parse(payload) as {
        choices?: Array<{
          delta?: { content?: string; reasoning_content?: string };
          message?: { content?: string };
        }>;
      };
      content += chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || "";
    } catch {
      // Ignore keepalive or malformed SSE lines; the final content is validated by caller.
    }
  });
  return content;
}

function parseJsonContent(content: string) {
  const trimmed = content.trim();
  const withoutFence = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  const extractedJson = extractJsonObject(withoutFence);
  try {
    return JSON.parse(extractedJson || withoutFence);
  } catch {
    return { text: content, parseWarning: "Model did not return valid JSON" };
  }
}

function extractJsonObject(content: string) {
  const firstObject = content.indexOf("{");
  const firstArray = content.indexOf("[");
  const start = firstArray >= 0 && (firstArray < firstObject || firstObject < 0) ? firstArray : firstObject;
  if (start < 0) return "";

  const openChar = content[start];
  const closeChar = openChar === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === openChar) depth += 1;
    if (char === closeChar) depth -= 1;
    if (depth === 0) return content.slice(start, index + 1);
  }

  return "";
}

function writeAiTrace(event: "start" | "finish" | "error", entry: Record<string, unknown>) {
  writeTraceLog("ai-trace.jsonl", {
    time: new Date().toISOString(),
    event,
    ...entry
  });
}

function writeAiSnapshot(fileName: string, entry: Record<string, unknown>) {
  writeTraceSnapshot(`ai-runs/${fileName}`, {
    time: new Date().toISOString(),
    ...entry
  });
}

function summarizePromptContext(context: PromptRequest) {
  return {
    businessDomain: context.businessDomain,
    modelingMode: context.modelingMode,
    sourceTableCount: context.sourceTables?.length || 0,
    sourceFieldCount: context.sourceTables?.reduce((sum, table) => sum + table.fields.length, 0) || 0,
    targetFieldCount: Array.isArray(context.targetFields) ? context.targetFields.length : 0,
    modelPlanCount: Array.isArray(context.modelPlans) ? context.modelPlans.length : 0,
    mappingCount: Array.isArray(context.mappings) ? context.mappings.length : 0,
    questionCount: Array.isArray(context.questions) ? context.questions.length : 0,
    answeredQuestionCount: Array.isArray(context.userAnswers) ? context.userAnswers.length : 0,
    hasSelectedModel: Boolean(context.selectedModel),
    strategy: context.strategy,
    uncertaintyPolicy: context.uncertaintyPolicy
  };
}

function compactPromptContext(promptName: PromptName, context: PromptRequest): PromptRequest {
  if (!context.sourceTables?.length) return context;
  if (promptName === "table_semantic") {
    return {
      ...context,
      sourceTables: context.sourceTables.map((table) => compactTableForTableSemantic(table)),
      targetFields: compactTargetFields(context.targetFields, 24)
    };
  }
  if (promptName === "model_recommendation") {
    return {
      ...context,
      sourceTables: context.sourceTables.map((table) => ({
        ...table,
        fields: pickKeyFields(table.fields, 18)
      })),
      targetFields: compactTargetFields(context.targetFields, 60)
    };
  }
  if (promptName === "field_mapping") {
    return {
      ...context,
      sourceTables: context.sourceTables.map((table) => ({
        ...table,
        fields: pickMappingFields(table.fields, context.targetFields, 16)
      })),
      targetFields: compactTargetFields(context.targetFields, 8)
    };
  }
  if (promptName === "field_semantic") {
    return {
      ...context,
      sourceTables: context.sourceTables.map((table) => ({
        ...table,
        fields: pickKeyFields(table.fields, 45)
      })),
      targetFields: compactTargetFields(context.targetFields, 80)
    };
  }
  return context;
}

function compactTableForTableSemantic(table: SourceTable): SourceTable {
  const fields = pickKeyFields(table.fields, 12);
  return {
    ...table,
    fields
  };
}

function compactTargetFields(targetFields: unknown, limit: number): unknown[] | undefined {
  if (!Array.isArray(targetFields)) return undefined;
  return targetFields.slice(0, limit).map((item) => {
    if (!item || typeof item !== "object") return item;
    const record = item as Record<string, unknown>;
    return {
      cn: record.cn,
      en: record.en,
      kind: record.kind,
      priority: record.priority
    };
  });
}

function pickKeyFields(fields: Field[], maxFields: number) {
  const selected = new Map<string, Field>();
  const add = (field?: Field) => {
    if (field && !selected.has(field.name)) selected.set(field.name, compactField(field));
  };

  fields.filter((field) => field.primary).forEach(add);
  fields.filter(isKeyModelingField).forEach(add);
  fields.slice(0, Math.min(8, fields.length)).forEach(add);

  return Array.from(selected.values()).slice(0, maxFields);
}

function pickMappingFields(fields: Field[], targetFields: unknown, maxFields: number) {
  const selected = new Map<string, Field>();
  const terms = buildTargetTerms(targetFields);
  const add = (field?: Field) => {
    if (field && !selected.has(field.name)) selected.set(field.name, compactField(field));
  };

  fields.filter((field) => field.primary).forEach(add);
  fields.filter(isKeyModelingField).forEach(add);
  fields.filter((field) => terms.some((term) => fieldMatchesTerm(field, term))).forEach(add);
  fields.slice(0, Math.min(6, fields.length)).forEach(add);

  return Array.from(selected.values()).slice(0, maxFields);
}

function buildTargetTerms(targetFields: unknown) {
  if (!Array.isArray(targetFields)) return [];
  return targetFields.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    return [record.cn, record.en, record.kind]
      .filter((value): value is string => typeof value === "string")
      .flatMap((value) => value.split(/[_\s,，、/]+/).concat(value.match(/[\u4e00-\u9fa5]{2,}/g) || []))
      .map((value) => value.toLowerCase())
      .filter((value) => value.length >= 2);
  }).slice(0, 80);
}

function fieldMatchesTerm(field: Field, term: string) {
  const text = `${field.name} ${field.comment} ${field.enumText || ""}`.toLowerCase();
  return text.includes(term);
}

function compactField(field: Field): Field {
  return {
    table: field.table,
    name: field.name,
    comment: field.comment,
    type: field.type,
    primary: field.primary,
    nullable: field.nullable,
    enumText: field.enumText,
    sampleValue: field.sampleValue
  };
}

function isKeyModelingField(field: Field) {
  const text = `${field.name} ${field.comment} ${field.enumText || ""}`.toLowerCase();
  return Boolean(field.primary)
    || /(^|_)id$|_id$|code|key|no|number|主键|外键|编号|编码|工号|手机号|电话/.test(text)
    || /time|date|day|month|year|时间|日期|期间|周期/.test(text)
    || /status|state|flag|type|result|reason|状态|结果|原因|类型|是否|标识/.test(text)
    || /org|dept|branch|company|area|region|组织|部门|分公司|大区|营业所|区域/.test(text)
    || /user|person|employee|owner|leader|manager|name|员工|人员|负责人|姓名|报名人|推荐人|操作人/.test(text)
    || /amount|price|cost|fee|qty|num|count|salary|金额|费用|价格|数量|次数|薪资|底薪|津贴/.test(text)
    || /process|apply|interview|onboard|offboard|resign|流程|申请|面试|入职|离职|审核|办理/.test(text);
}

function summarizeAiResult(result: unknown) {
  if (!result || typeof result !== "object") return { type: typeof result };
  const record = result as Record<string, unknown>;
  return {
    keys: Object.keys(record),
    candidateCount: Array.isArray(record.candidates) ? record.candidates.length : undefined,
    mappingCount: Array.isArray(record.mappings) ? record.mappings.length : undefined,
    questionCount: Array.isArray(record.questions) ? record.questions.length : undefined,
    outputColumnCount: Array.isArray(record.outputColumns) ? record.outputColumns.length : undefined,
    hasCreateTableSql: typeof record.createTableSql === "string" && record.createTableSql.trim().length > 0,
    hasInsertSql: typeof record.insertSql === "string" && record.insertSql.trim().length > 0,
    hasPrdMarkdown: typeof record.prdMarkdown === "string" && record.prdMarkdown.trim().length > 0,
    parseWarning: record.parseWarning
  };
}
