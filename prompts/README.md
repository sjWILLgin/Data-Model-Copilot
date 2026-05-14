# ModelFlow Prompt Pack

Copyright (c) 2026 will（水金）. All rights reserved.

This directory contains reusable prompt templates for the AI-assisted middle-layer modeling workbench.

The prompts are intentionally domain-general. They cover sales performance, supply chain, finance, HR, labor cost, product, master data, customer, channel, manufacturing, and other enterprise data domains through shared modeling concepts: business object, business activity, event/process, dimension, fact, grain, metric, dictionary, lineage, and question closure.

## How To Use

The backend should load a task prompt, inject the structured context, call the configured model, validate the JSON response, and persist both input and output for audit.

Recommended runtime composition:

```text
system:
  Read prompts/aliyun_onedata_methodology.md
  Read prompts/_shared_system.md

developer:
  Read one task prompt, such as prompts/model_recommendation.md

user:
  Provide task context JSON:
  {
    "businessDomain": "...",
    "modelingMode": "...",
    "targetFields": [],
    "sourceTables": [],
    "selectedModel": null,
    "questions": [],
    "userAnswers": [],
    "aiConfig": {}
  }
```

## Prompt Files

| File | Purpose |
|---|---|
| `aliyun_onedata_methodology.md` | Alibaba Cloud / OneData modeling methodology baseline |
| `_shared_system.md` | Shared role, methodology, safety, and output rules |
| `table_semantic.md` | Source table and business process semantic analysis |
| `field_semantic.md` | Field semantic classification and ambiguity detection |
| `model_recommendation.md` | Candidate CDM model recommendation |
| `field_mapping.md` | Target-to-source field mapping |
| `question_review.md` | Re-map fields after users answer questions |
| `sql_generation.md` | SQL draft generation |
| `prd_generation.md` | PRD and delivery document generation |

## Required Guarantees

1. Output JSON only unless the route explicitly asks for Markdown or SQL.
2. Never silently invent missing source tables or source fields.
3. If uncertain, create questions instead of forcing a conclusion.
4. The final target model is user-selected. The model may recommend candidates but must not make the final decision.
5. Preserve grain. Do not mix object grain, transaction grain, event grain, snapshot grain, and aggregate grain without explicit transformation logic.
6. Distinguish current attributes from business-time attributes.
7. Mark dictionary, enum, master data, and reference data dependencies.
8. Keep the prompts generic across domains.

## Domain Coverage

Use these examples only as domain hints, not hard-coded assumptions:

| Domain | Common objects | Common activities/events | Common risks |
|---|---|---|---|
| Sales performance | customer, store, salesperson, product, channel | order, shipment, return, visit, target assignment | target vs actual grain, channel attribution, return offset |
| Supply chain | supplier, material, warehouse, SKU, route | purchase order, inbound, outbound, transfer, inventory snapshot | snapshot vs transaction grain, lot/batch, unit conversion |
| Finance | account, cost center, vendor, invoice, contract | voucher, invoice, payment, reimbursement, accrual | accounting period, tax, currency, reversal, allocation |
| HR | person, org, position, job, employee | hire, transfer, attendance, performance, resignation | current org vs historical org, effective dates, status history |
| Labor cost | employee, org, cost center, project | payroll, bonus, social insurance, allocation | payroll period, allocation basis, privacy, currency |
| Product | product, SKU, category, brand, lifecycle stage | launch, price change, listing, delisting, promotion | SKU/SPU grain, category history, price validity |
| Master data | customer, product, org, supplier, employee | create, merge, split, update, deactivate | slowly changing dimensions, duplicate records, golden record |

## Suggested Backend Contract

```ts
type PromptRequest = {
  taskId: string;
  promptName: string;
  businessDomain: string;
  modelingMode: string;
  sourceTables: SourceTable[];
  targetFields: TargetField[];
  selectedModel?: ModelPlan;
  modelPlans?: ModelPlan[];
  mappings?: Mapping[];
  questions?: Question[];
  userAnswers?: Question[];
  strategy: string;
  uncertaintyPolicy: string;
};
```

Validate every response with a schema before applying it to the product state.
