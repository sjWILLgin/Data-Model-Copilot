# Prompt: PRD And Deliverable Generation

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

Generate a complete model design PRD or delivery document based on selected model, mappings, source tables, questions, SQL draft, and dictionary dependencies.

The PRD must reflect the final engineering delivery: `CREATE TABLE` and `INSERT INTO ... SELECT ...`. Do not describe a table definition that differs from the SQL draft output columns.

## Input JSON

```json
{
  "taskName": "通用业务过程分析模型",
  "businessDomain": "供应链",
  "selectedModel": {},
  "candidateModels": [],
  "sourceTables": [],
  "targetFields": [],
  "mappings": [],
  "questions": [],
  "sqlDraft": "",
  "createTableSql": "",
  "insertSql": "",
  "outputColumns": [],
  "enumDictionaries": []
}
```

## Document Requirements

1. State the business background and model goal.
2. State the selected target model and explain why.
3. List candidate models and mark the selected one.
4. Confirm model layer, model type, grain, primary key suggestion, and source tables.
5. Provide field mapping table.
6. Provide open questions and resolved questions.
7. Provide dictionary dependencies.
8. Provide grain risks and current/historical attribute decisions.
9. Provide SQL draft summary.
10. Provide delivery checklist for developers and business users.
11. Verify that PRD field list, DDL columns, and INSERT SELECT output columns are consistent.
12. If there is inconsistency, mark it as a blocking delivery risk.

## Alibaba Cloud / OneData PRD Sections

The PRD must include these methodology sections:

1. 数仓分层定位：说明目标模型属于 DIM/DWD/DWS/ADS 哪一层。
2. 数据域与业务过程：说明模型覆盖的数据域和业务过程。
3. 业务对象：说明涉及的一致性维度或主数据对象。
4. 模型粒度：必须明确，未确认时标为阻塞问题。
5. 事实类型：事务事实、周期快照、累积快照、无事实事实。
6. 度量可加性：可加、半可加、不可加。
7. 维度策略：当前属性、历史属性、SCD/拉链/快照。
8. 公共层依赖：说明 DWD/DIM/DWS 之间的依赖，不鼓励 ODS 直连 ADS。
9. 字典和主数据依赖：列出需要补充的字典和主数据表。
10. 质量规则：主键唯一、非空、枚举合法、时间顺序、金额数量合理性。

## Required Output JSON

```json
{
  "markdown": "# 模型设计 PRD\\n...",
  "excelSheets": [
    {
      "sheetName": "模型总览",
      "rows": []
    },
    {
      "sheetName": "字段映射关系",
      "rows": []
    },
    {
      "sheetName": "DDL与INSERT一致性检查",
      "rows": []
    }
  ],
  "deliveryChecklist": [
    "确认目标模型主粒度",
    "补充状态字典"
  ],
  "oneDataMethodologySummary": {
    "layer": "DWS",
    "dataDomain": "交易域",
    "businessProcess": "下单",
    "grain": "一条订单一行",
    "factType": "累积快照事实表",
    "dimensionStrategy": "客户、商品、组织使用一致性维度",
    "publicLayerDependency": "建议依赖 DWD 订单明细和 DIM 客户/商品/组织"
  },
  "warnings": [
    "仍存在待确认问题，建议不要进入开发交付"
  ]
}
```
