/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const logsDir = "logs";

mkdirSync(logsDir, { recursive: true });

export function writeTraceLog(fileName: string, entry: Record<string, unknown>) {
  appendFileSync(`${logsDir}/${fileName}`, `${JSON.stringify(entry)}\n`);
}

export function writeTraceSnapshot(fileName: string, entry: Record<string, unknown>) {
  const targetPath = `${logsDir}/${fileName}`;
  mkdirSync(path.dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, JSON.stringify(entry, null, 2));
}

export function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => {
      if (isSecretKey(key)) {
        return [key, item ? "[REDACTED]" : item];
      }
      return [key, redactValue(item)];
    })
  );
}

function isSecretKey(key: string) {
  return /(api[-_]?key|secret|token|password|authorization|credential)/i.test(key);
}
