/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PromptName, PromptRegistry } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const promptsDir = path.join(projectRoot, "prompts");

export async function loadPromptRegistry(): Promise<PromptRegistry> {
  const content = await readFile(path.join(promptsDir, "prompt-registry.json"), "utf-8");
  return JSON.parse(content) as PromptRegistry;
}

export async function listPromptTasks() {
  const registry = await loadPromptRegistry();
  return {
    version: registry.version,
    methodology: registry.methodology,
    sharedSystem: registry.sharedSystem,
    tasks: registry.tasks
  };
}

export async function buildPromptMessages(promptName: PromptName, context: unknown) {
  const registry = await loadPromptRegistry();
  const task = registry.tasks[promptName];
  if (!task) {
    throw new Error(`Unknown prompt task: ${promptName}`);
  }

  const [methodology, sharedSystem, taskPrompt] = await Promise.all([
    readFile(path.join(promptsDir, registry.methodology), "utf-8"),
    readFile(path.join(promptsDir, registry.sharedSystem), "utf-8"),
    readFile(path.join(promptsDir, task.file), "utf-8")
  ]);

  return [
    {
      role: "system" as const,
      content: `${methodology}\n\n${sharedSystem}\n\n${taskPrompt}`
    },
    {
      role: "user" as const,
      content: JSON.stringify(context, null, 2)
    }
  ];
}
