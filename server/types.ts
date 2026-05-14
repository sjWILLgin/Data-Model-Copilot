/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

export type AiTaskKey = "semantic" | "reasoning" | "mapping" | "sql" | "document" | "review";

export type PromptName =
  | "table_semantic"
  | "field_semantic"
  | "model_recommendation"
  | "field_mapping"
  | "question_review"
  | "sql_generation"
  | "prd_generation";

export type AiProvider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKeyRef: string;
  apiKey?: string;
  enabled: boolean;
};

export type AiConfig = {
  providers: AiProvider[];
  taskModels: Record<AiTaskKey, { providerId: string; model: string }>;
  strategy: string;
  uncertaintyPolicy: string;
  maxRounds: number;
  temperature: number;
};

export type PromptRegistry = {
  version: string;
  methodology: string;
  sharedSystem: string;
  tasks: Record<PromptName, { file: string; description: string }>;
};

export type Field = {
  table: string;
  name: string;
  comment: string;
  type: string;
  primary?: boolean;
  nullable?: string;
  enumText?: string;
  sampleValue?: string;
};

export type SourceTable = {
  name: string;
  comment: string;
  fields: Field[];
};

export type DatabaseConfig = {
  id: string;
  name: string;
  engine: string;
  environment: string;
  host: string;
  port: string;
  database: string;
  schema: string;
  username: string;
  passwordRef: string;
  odsPattern: string;
  enabled: boolean;
};

export type PromptRequest = {
  businessDomain?: string;
  modelingMode?: string;
  sourceTables?: SourceTable[];
  targetFields?: unknown[];
  selectedModel?: unknown;
  modelPlans?: unknown[];
  mappings?: unknown[];
  questions?: unknown[];
  userAnswers?: unknown[];
  aiConfig?: AiConfig;
  strategy?: string;
  uncertaintyPolicy?: string;
};
