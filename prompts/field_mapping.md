# Prompt: Field Mapping

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

Map each target field to the most appropriate source table and source field, generate transformation logic, feasibility, confidence, and questions.

## Input JSON

```json
{
  "businessDomain": "通用业务域",
  "selectedModel": {
    "tableName": "dws_xxx_wide",
    "layer": "DWS",
    "grain": "一条业务单据一行"
  },
  "targetFields": [],
  "sourceTables": [],
  "tableSemantics": [],
  "fieldSemantics": [],
  "knownQuestions": []
}
```

## Mapping Rules

1. A field name match is not enough. Check business meaning, grain, time point, status, dictionary, and source reliability.
2. Direct mapping is allowed only if the source field has the same grain and meaning.
3. If source field is a code, mark dictionary dependency.
4. If source field is event/process detail and target model is wide/aggregate, define pivot/aggregation logic.
5. If target field asks for current attribute and source field is historical/event-time attribute, create a question.
6. If target field asks for historical attribute and only current master data exists, create a question.
7. If no reliable source exists, set sourceTable/sourceField to null and feasibility to 需补充底表.

## Alibaba Cloud / OneData Mapping Procedure

For every target field:

1. Confirm whether the field belongs to dimension attribute, degenerate dimension, fact measure, event milestone, status, dictionary, audit field, or derived metric.
2. Confirm whether the field grain matches the selected target model grain.
3. If selected target model is DWD, prefer source ODS fields that preserve atomic business process detail.
4. If selected target model is DWS, prefer DWD/DIM dependencies. If only ODS is provided, mark this as a temporary prototype assumption and output risk.
5. If field comes from DIM/master data, state whether current attribute or historical/business-time attribute is required.
6. If field comes from event detail but target model is wide table, state pivot condition, aggregation rule, and tie-breaker rule.
7. If field is a metric, state aggregation function, business filter, statistic period, and additivity.
8. If field is inventory/balance/headcount snapshot, mark as semi-additive and do not allow naive summation across time.
9. If field is ratio/price/rate, mark as non-additive and require recalculation logic.
10. If field is code/status/type, require dictionary source or enum confirmation.
11. If source relation is one-to-many, do not directly join into a one-row target without aggregation/pivot/bridge logic.

## Required Output JSON

```json
{
  "mappings": [
    {
      "targetFieldName": "业务状态",
      "suggestedEnglishName": "business_status",
      "fieldType": "枚举",
      "sourceTable": "ods_business_order",
      "sourceField": "status",
      "logic": "取 ods_business_order.status，并关联状态字典翻译中文含义",
      "grainCheck": "与目标单据粒度一致",
      "currentHistoricalPolicy": "不涉及",
      "aggregationRule": "不聚合",
      "dictionaryDependency": "业务状态字典",
      "layerDependencyRisk": "当前直接使用 ODS，正式 DWS 建议依赖 DWD 明细事实",
      "feasibility": "需关联字典",
      "confidence": "中高",
      "status": "待补字典",
      "lineage": [
        {
          "sourceTable": "ods_business_order",
          "sourceField": "status",
          "transform": "dictionary_translate"
        }
      ],
      "risks": ["状态字典来源未确认"],
      "questions": [
        {
          "id": "Q_MAP_001",
          "type": "字典疑问",
          "desc": "业务状态 status 是否有公共状态字典？",
          "suggestion": "建议补充状态字典表或枚举说明",
          "owner": "开发",
          "status": "待补字典"
        }
      ]
    }
  ],
  "missingFields": [
    {
      "targetFieldName": "当前组织名称",
      "reason": "来源表只有 org_id，缺少组织名称或组织主数据",
      "suggestion": "补充组织维表或主数据表"
    }
  ],
  "summary": "字段映射摘要"
}
```
