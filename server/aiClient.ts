/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import { defaultAiConfig, promptToAiTask } from "./defaultConfig.js";
import { buildMockAiResult } from "./mockAi.js";
import { buildPromptMessages } from "./promptRegistry.js";
import type { AiConfig, PromptName, PromptRequest } from "./types.js";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function runPrompt(promptName: PromptName, request: PromptRequest) {
  const aiConfig = mergeAiConfig(request.aiConfig);
  const taskKey = promptToAiTask[promptName];
  const taskModel = aiConfig.taskModels[taskKey];
  const provider = aiConfig.providers.find((item) => item.id === taskModel.providerId) || aiConfig.providers.find((item) => item.enabled) || aiConfig.providers[0];
  const apiKey = getProviderApiKey(provider);
  const allowMock = process.env.ALLOW_MOCK_AI === "true";
  const messages = await buildPromptMessages(promptName, {
    ...request,
    strategy: request.strategy || aiConfig.strategy,
    uncertaintyPolicy: request.uncertaintyPolicy || aiConfig.uncertaintyPolicy
  });

  if (!provider || !apiKey) {
    if (!allowMock) {
      throw new Error(`Missing API key for provider ${provider?.name || "unknown"} (${provider?.apiKeyRef || "no apiKeyRef"})`);
    }
    return {
      mode: "mock",
      provider: provider?.name || "mock",
      model: taskModel.model,
      promptName,
      result: buildMockAiResult(promptName, request)
    };
  }

  const content = await callOpenAiCompatible({
    baseUrl: provider.baseUrl,
    apiKey,
    model: taskModel.model,
    messages,
    temperature: aiConfig.temperature,
    stream: isStreamOnlyReasoningModel(taskModel.model)
  });

  return {
    mode: "live",
    provider: provider.name,
    model: taskModel.model,
    promptName,
    result: parseJsonContent(content),
    rawText: content
  };
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

async function callOpenAiCompatible(input: { baseUrl: string; apiKey: string; model: string; messages: ChatMessage[]; temperature: number; stream?: boolean }) {
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
    })
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
  try {
    return JSON.parse(withoutFence);
  } catch {
    return { text: content, parseWarning: "Model did not return valid JSON" };
  }
}
