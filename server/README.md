# Modelcreater Backend

Copyright (c) 2026 will（水金）. All rights reserved.

This backend owns all production-facing AI and metadata integration concerns.

The frontend must not call large-model providers directly and must not store real API keys or database passwords.

## Run

```bash
cp .env.example .env
npm run dev:server
```

Health check:

```bash
curl http://localhost:8787/api/health
```

## AI Prompt API

All prompt tasks are registered in `prompts/prompt-registry.json`.

```bash
curl -X POST http://localhost:8787/api/ai/table_semantic \
  -H 'content-type: application/json' \
  -d '{"businessDomain":"销售过程","sourceTables":[],"targetFields":[]}'
```

If the configured provider API key is missing and `ALLOW_MOCK_AI=true`, the server returns deterministic mock output. Set `ALLOW_MOCK_AI=false` to require real model calls.

Supported prompt tasks:

- `table_semantic`
- `field_semantic`
- `model_recommendation`
- `field_mapping`
- `question_review`
- `sql_generation`
- `prd_generation`

## Metadata API

Current metadata APIs are mock adapters. Replace `metadataService.ts` with real read-only adapters for MaxCompute, Hive, Hologres, StarRocks, Doris, PostgreSQL, etc.

```bash
curl -X POST http://localhost:8787/api/metadata/ods-tables \
  -H 'content-type: application/json' \
  -d '{"keyword":"sales"}'
```

## Security Rules

1. Real API keys stay in `.env` or secret managers.
2. Database passwords stay in `.env` or secret managers.
3. Metadata accounts should be read-only.
4. ODS selection only reads metadata and optional samples.
5. CDM generation only creates design artifacts, DDL drafts, and SQL drafts.
6. Any physical write or scheduling must require manual review and approval.
