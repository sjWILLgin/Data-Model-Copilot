# Prompt: Field Semantic Analysis

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

Classify each source field and target field into semantic categories, detect ambiguity, identify dictionaries, current/historical attributes, metric fields, and grain signals.

## Scale Control

For large inputs, do not output one verbose object for every source field. Keep the response compact and valid JSON:

1. `sourceFieldSemantics` may include only key fields that affect modeling decisions, joins, dictionaries, time logic, status flow, grain, or SQL generation.
2. Prefer a concise `fieldCoverageSummary` grouped by table for ordinary descriptive/audit fields.
3. Keep `evidence`, `ambiguities`, and `questions` short. Do not write long explanations.
4. The total response should stay under 12,000 Chinese characters.
5. If complete field-level output would exceed the limit, output `truncatedByDesign: true` and prioritize P0/P1 target fields, primary keys, foreign keys, status fields, time fields, organization/person fields, and metric fields.
6. Always return a complete JSON object. Never stop in the middle of an array.

## Semantic Categories

Use one or more:

```json
[
  "主键字段",
  "外键字段",
  "业务对象字段",
  "组织字段",
  "人员/负责人字段",
  "客户字段",
  "供应商字段",
  "商品/SKU字段",
  "产品字段",
  "时间字段",
  "状态字段",
  "枚举字段",
  "金额字段",
  "数量字段",
  "指标字段",
  "描述字段",
  "事件/流程字段",
  "快照周期字段",
  "分区字段",
  "审计字段",
  "派生字段",
  "疑问字段"
]
```

## Key Domain Considerations

1. Sales: distinguish sales order amount, shipped amount, returned amount, target amount, visit count, customer ownership.
2. Supply chain: distinguish transaction quantity, inventory snapshot quantity, available quantity, batch/lot, unit conversion.
3. Finance: distinguish invoice amount, payment amount, tax amount, reimbursed amount, accounting period, currency.
4. HR: distinguish person identity, employee status, org at event time, current org, position history.
5. Labor cost: distinguish payroll period, salary item, social insurance, cost allocation, project allocation.
6. Product: distinguish SKU, SPU, category, brand, price validity, listing status.
7. Master data: distinguish natural key, surrogate key, golden record, merge/split relation, effective date.

## Alibaba Cloud / OneData Field Checks

For every field, judge:

1. Whether it is dimension attribute, fact measure, degenerate dimension, status, event milestone, audit field, dictionary code, or partition field.
2. Whether it contributes to DIM, DWD, or DWS.
3. Whether it is current attribute or business-time attribute.
4. Whether it is additive, semi-additive, non-additive, or not a measure.
5. Whether it requires dictionary/master data lookup.
6. Whether it indicates SCD / effective-date / snapshot design need.
7. Whether it creates grain conflict if placed in the selected target model.

## Required Output JSON

```json
{
  "sourceFieldSemantics": [
    {
      "tableName": "ods_xxx",
      "fieldName": "status",
      "businessName": "业务状态",
      "semanticTypes": ["状态字段", "枚举字段"],
      "suggestedEnglishName": "business_status",
      "isPrimaryKey": false,
      "isForeignKey": false,
      "isDictionaryNeeded": true,
      "isCurrentOrHistoricalSensitive": false,
      "warehouseRole": "DWD退化维度 / DWS筛选维度",
      "measureAdditivity": "非度量",
      "scdOrSnapshotNeed": "不需要",
      "grainSignal": "单据粒度",
      "confidence": "中高",
      "evidence": ["字段注释包含 1:新建 2:完成"],
      "ambiguities": ["缺少状态字典表"],
      "questions": []
    }
  ],
  "targetFieldSemantics": [
    {
      "targetFieldName": "业务状态",
      "suggestedEnglishName": "business_status",
      "semanticTypes": ["状态字段", "枚举字段"],
      "expectedGrain": "目标模型主粒度",
      "isRequiredForModeling": true,
      "confidence": "中高",
      "questions": []
    }
  ],
  "duplicateOrSynonymFields": [
    {
      "fields": ["客户名称", "客户名"],
      "suggestion": "疑似同义字段，请确认是否合并"
    }
  ],
  "fieldCoverageSummary": [
    {
      "tableName": "ods_xxx",
      "coveredKeyFieldCount": 12,
      "ordinaryFieldCount": 30,
      "notes": "普通描述字段已省略，仅保留会影响建模和 SQL 的字段"
    }
  ],
  "truncatedByDesign": false,
  "summary": "字段语义分析摘要"
}
```
