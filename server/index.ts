/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { appendFileSync, mkdirSync } from "node:fs";
import { runPrompt, testAiProvider } from "./aiClient.js";
import { listOdsTables, testMetadataConnection } from "./metadataService.js";
import { listPromptTasks } from "./promptRegistry.js";
import type { AiProvider, DatabaseConfig, PromptName, PromptRequest } from "./types.js";

const app = express();
const port = Number(process.env.PORT || 8787);
const logsDir = "logs";
type AiJob = {
  id: string;
  promptName: PromptName;
  status: "queued" | "running" | "done" | "error" | "canceled";
  createdAt: string;
  updatedAt: string;
  controller: AbortController;
  result?: unknown;
  error?: string;
};
type WorkflowJob = {
  id: string;
  type: "field_mapping";
  status: "queued" | "running" | "done" | "error" | "canceled";
  createdAt: string;
  updatedAt: string;
  controller: AbortController;
  currentStep: string;
  progress: { current: number; total: number };
  result?: unknown;
  error?: string;
};
const aiJobs = new Map<string, AiJob>();
const workflowJobs = new Map<string, WorkflowJob>();

mkdirSync(logsDir, { recursive: true });

app.set("etag", false);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "20mb" }));

app.use((req, res, next) => {
  if (!req.path.startsWith("/api")) {
    next();
    return;
  }

  const startedAt = Date.now();
  let responseSummary: Record<string, unknown> = {};
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const originalJson = res.json.bind(res);
  res.json = ((body?: unknown) => {
    responseSummary = summarizeResponse(body);
    return originalJson(body);
  }) as typeof res.json;

  res.on("finish", () => {
    writeLog({
      time: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
      response: responseSummary
    });
  });

  next();
});

const promptNameSchema = z.enum([
  "table_semantic",
  "field_semantic",
  "model_recommendation",
  "field_mapping",
  "question_review",
  "sql_generation",
  "prd_generation"
]);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "modelcreater-backend",
    mode: process.env.ALLOW_MOCK_AI === "true" ? "mock-enabled" : "live-required"
  });
});

app.get("/api/prompts", async (_req, res, next) => {
  try {
    res.json(await listPromptTasks());
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/provider/test", async (req, res, next) => {
  try {
    const { provider, model, temperature } = req.body as {
      provider?: AiProvider;
      model?: string;
      temperature?: number;
    };
    res.json(await testAiProvider({ provider, model, temperature }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/:promptName", async (req, res, next) => {
  try {
    const promptName = promptNameSchema.parse(req.params.promptName) as PromptName;
    const body = req.body as PromptRequest;
    const result = await runPrompt(promptName, body);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

app.post("/api/ai/jobs/:promptName", async (req, res, next) => {
  try {
    const promptName = promptNameSchema.parse(req.params.promptName) as PromptName;
    const body = req.body as PromptRequest;
    const jobId = `${promptName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const controller = new AbortController();
    const now = new Date().toISOString();
    const job: AiJob = {
      id: jobId,
      promptName,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      controller
    };
    aiJobs.set(jobId, job);
    res.json({ ok: true, jobId, status: job.status, promptName });

    void runAiJob(job, body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/ai/jobs/:jobId", (req, res) => {
  const job = aiJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ ok: false, error: "AI job not found" });
    return;
  }
  res.json(summarizeJob(job));
});

app.delete("/api/ai/jobs/:jobId", (req, res) => {
  const job = aiJobs.get(req.params.jobId);
  if (!job) {
    res.status(404).json({ ok: false, error: "AI job not found" });
    return;
  }
  if (job.status === "queued" || job.status === "running") {
    job.status = "canceled";
    job.updatedAt = new Date().toISOString();
    job.controller.abort();
  }
  res.json(summarizeJob(job));
});

app.post("/api/workflows/field-mapping", async (req, res, next) => {
  try {
    const body = req.body as PromptRequest;
    const targetFields = Array.isArray(body.targetFields) ? body.targetFields : [];
    const total = Math.max(1, Math.ceil(targetFields.length / 6));
    const workflowId = `field_mapping_flow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const job: WorkflowJob = {
      id: workflowId,
      type: "field_mapping",
      status: "queued",
      createdAt: now,
      updatedAt: now,
      controller: new AbortController(),
      currentStep: "等待开始字段映射批处理",
      progress: { current: 0, total }
    };
    workflowJobs.set(workflowId, job);
    res.json(summarizeWorkflow(job));
    void runFieldMappingWorkflow(job, body);
  } catch (error) {
    next(error);
  }
});

app.get("/api/workflows/:workflowId", (req, res) => {
  const job = workflowJobs.get(req.params.workflowId);
  if (!job) {
    res.status(404).json({ ok: false, error: "Workflow job not found" });
    return;
  }
  res.json(summarizeWorkflow(job));
});

app.delete("/api/workflows/:workflowId", (req, res) => {
  const job = workflowJobs.get(req.params.workflowId);
  if (!job) {
    res.status(404).json({ ok: false, error: "Workflow job not found" });
    return;
  }
  if (job.status === "queued" || job.status === "running") {
    job.status = "canceled";
    job.currentStep = "用户手动停止字段映射流程";
    job.updatedAt = new Date().toISOString();
    job.controller.abort();
  }
  res.json(summarizeWorkflow(job));
});

app.post("/api/metadata/test", async (req, res, next) => {
  try {
    const config = req.body as DatabaseConfig;
    res.json(await testMetadataConnection(config));
  } catch (error) {
    next(error);
  }
});

app.post("/api/metadata/ods-tables", async (req, res, next) => {
  try {
    const { config, keyword } = req.body as { config?: DatabaseConfig; keyword?: string };
    const tables = await listOdsTables(config, keyword);
    res.json({ mode: "mock", tables });
  } catch (error) {
    next(error);
  }
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : "Unknown server error";
  writeLog({
    time: new Date().toISOString(),
    level: "error",
    message,
    stack: error instanceof Error ? error.stack : undefined
  });
  console.error("[modelcreater-backend] request failed", error);
  res.status(500).json({ ok: false, error: message });
});

app.listen(port, () => {
  console.log(`Modelcreater backend listening on http://localhost:${port}`);
});

function writeLog(entry: Record<string, unknown>) {
  appendFileSync(`${logsDir}/app.log`, `${JSON.stringify(entry)}\n`);
}

async function runAiJob(job: AiJob, body: PromptRequest) {
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  writeLog({
    time: job.updatedAt,
    level: "info",
    event: "ai_job_started",
    jobId: job.id,
    promptName: job.promptName
  });
  try {
    const result = await runPrompt(job.promptName, body, { signal: job.controller.signal });
    if (job.controller.signal.aborted) return;
    job.status = "done";
    job.result = result;
    job.updatedAt = new Date().toISOString();
    writeLog({
      time: job.updatedAt,
      level: "info",
      event: "ai_job_finished",
      jobId: job.id,
      promptName: job.promptName
    });
  } catch (error) {
    job.updatedAt = new Date().toISOString();
    if (job.controller.signal.aborted) {
      job.status = "canceled";
      job.error = "AI job canceled by user";
    } else {
      job.status = "error";
      job.error = error instanceof Error ? error.message : "Unknown AI job error";
    }
    writeLog({
      time: job.updatedAt,
      level: job.status === "canceled" ? "info" : "error",
      event: "ai_job_failed",
      jobId: job.id,
      promptName: job.promptName,
      status: job.status,
      error: job.error
    });
  }
}

function summarizeJob(job: AiJob) {
  return {
    ok: job.status !== "error",
    jobId: job.id,
    promptName: job.promptName,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.status === "done" ? job.result : undefined,
    error: job.error
  };
}

async function runFieldMappingWorkflow(job: WorkflowJob, body: PromptRequest) {
  job.status = "running";
  job.updatedAt = new Date().toISOString();
  writeLog({
    time: job.updatedAt,
    level: "info",
    event: "workflow_started",
    workflowId: job.id,
    type: job.type
  });
  try {
    const targetFields = Array.isArray(body.targetFields) ? body.targetFields : [];
    const batches = chunkArray(targetFields, 6);
    const combinedMappings: unknown[] = [];
    const combinedQuestions: unknown[] = [];
    let provider = "";
    let model = "";

    for (const [index, batch] of batches.entries()) {
      if (job.controller.signal.aborted) throw new Error("Workflow canceled");
      job.progress = { current: index, total: batches.length };
      job.currentStep = `字段映射第 ${index + 1}/${batches.length} 批`;
      job.updatedAt = new Date().toISOString();
      const result = await runPrompt("field_mapping", {
        ...body,
        targetFields: batch,
        mappingBatch: {
          batchIndex: index + 1,
          batchTotal: batches.length
        }
      } as PromptRequest, { signal: job.controller.signal }) as {
        provider?: string;
        model?: string;
        result?: { mappings?: unknown[]; questions?: unknown[]; missingFields?: unknown[] };
      };
      provider = result.provider || provider;
      model = result.model || model;
      if (Array.isArray(result.result?.mappings)) combinedMappings.push(...result.result.mappings);
      if (Array.isArray(result.result?.questions)) combinedQuestions.push(...result.result.questions);
      job.progress = { current: index + 1, total: batches.length };
      job.result = {
        mode: "live",
        provider,
        model,
        promptName: "field_mapping",
        result: {
          mappings: combinedMappings,
          questions: combinedQuestions,
          summary: `字段映射已完成 ${index + 1}/${batches.length} 批`
        }
      };
      job.updatedAt = new Date().toISOString();
    }

    job.status = "done";
    job.currentStep = "字段映射批处理完成";
    job.updatedAt = new Date().toISOString();
    writeLog({
      time: job.updatedAt,
      level: "info",
      event: "workflow_finished",
      workflowId: job.id,
      type: job.type
    });
  } catch (error) {
    job.updatedAt = new Date().toISOString();
    if (job.controller.signal.aborted) {
      job.status = "canceled";
      job.error = "Workflow canceled by user";
    } else {
      job.status = "error";
      job.error = error instanceof Error ? error.message : "Unknown workflow error";
    }
    writeLog({
      time: job.updatedAt,
      level: job.status === "canceled" ? "info" : "error",
      event: "workflow_failed",
      workflowId: job.id,
      type: job.type,
      status: job.status,
      error: job.error
    });
  }
}

function summarizeWorkflow(job: WorkflowJob) {
  return {
    ok: job.status !== "error",
    workflowId: job.id,
    type: job.type,
    status: job.status,
    currentStep: job.currentStep,
    progress: job.progress,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    result: job.result,
    error: job.error
  };
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function summarizeResponse(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  return {
    ok: record.ok,
    mode: record.mode,
    provider: record.provider,
    model: record.model,
    promptName: record.promptName,
    jobId: record.jobId,
    workflowId: record.workflowId,
    status: record.status,
    currentStep: record.currentStep,
    keySource: record.keySource,
    service: record.service,
    error: record.error
  };
}
