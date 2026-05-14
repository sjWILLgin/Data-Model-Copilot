# Prompt: Question Review And Re-Mapping

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

After users answer questions in the question center, re-evaluate mappings, feasibility, logic, and remaining risks.

## Input JSON

```json
{
  "businessDomain": "通用业务域",
  "selectedModel": {},
  "currentMappings": [],
  "questions": [
    {
      "id": "Q001",
      "type": "时间口径",
      "desc": "关键时间字段取业务发生时间还是完成时间？",
      "answer": "完成时间取事件表中 event_type=完成且结果有效的最早时间",
      "status": "已确认"
    }
  ],
  "sourceTables": [],
  "targetFields": []
}
```

## Review Rules

1. Apply user-confirmed answers as higher-priority context than previous AI assumptions.
2. If an answer says 二期处理, update related mappings to 二期处理.
3. If an answer says 不纳入本期, update related mappings to 不纳入本期 or 不建议建设.
4. If an answer provides dictionary source, update feasibility from 需关联字典 to 可加工生成 or 待补字典 depending on completeness.
5. If an answer provides source table/field, re-map the target field.
6. If the answer is still insufficient, keep or create questions.
7. Preserve traceability and explain what changed.

## OneData Review Checks

After applying user answers, re-check:

1. Whether selected target model grain is still valid.
2. Whether DWS fields should depend on DWD/DIM rather than raw ODS.
3. Whether event-detail fields have explicit pivot/aggregation logic.
4. Whether current/historical dimension policy is confirmed.
5. Whether additive/semi-additive/non-additive metric rules are correct.
6. Whether unresolved questions block delivery.

## Required Output JSON

```json
{
  "updatedMappings": [
    {
      "targetFieldName": "完成时间",
      "sourceTable": "ods_business_event_record",
      "sourceField": "event_time",
      "logic": "取 event_type=完成 且 event_result=有效 的最早 event_time",
      "feasibility": "可加工生成",
      "confidence": "高",
      "status": "AI复核通过",
      "oneDataCheck": "符合目标模型粒度；事件明细已通过条件聚合进入宽表",
      "changeReason": "采纳 Q001 用户补充口径"
    }
  ],
  "resolvedQuestions": ["Q001"],
  "remainingQuestions": [
    {
      "id": "Q_REVIEW_001",
      "type": "字典疑问",
      "desc": "event_type=完成 的枚举编码值未确认",
      "suggestion": "请补充事件类型字典",
      "owner": "开发",
      "status": "待补字典"
    }
  ],
  "reviewSummary": "复核摘要"
}
```
