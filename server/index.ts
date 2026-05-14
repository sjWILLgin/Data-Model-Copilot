/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import "dotenv/config";
import express from "express";
import cors from "cors";
import { z } from "zod";
import { runPrompt, testAiProvider } from "./aiClient.js";
import { listOdsTables, testMetadataConnection } from "./metadataService.js";
import { listPromptTasks } from "./promptRegistry.js";
import type { AiProvider, DatabaseConfig, PromptName, PromptRequest } from "./types.js";

const app = express();
const port = Number(process.env.PORT || 8787);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "20mb" }));

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
  console.error("[modelcreater-backend] request failed", error);
  res.status(500).json({ ok: false, error: message });
});

app.listen(port, () => {
  console.log(`Modelcreater backend listening on http://localhost:${port}`);
});
