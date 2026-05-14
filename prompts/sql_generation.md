# Prompt: SQL Draft Generation

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

Generate a development-reference SQL draft for the user-selected target model.

The SQL is not production-ready unless reviewed by data developers.

## Input JSON

```json
{
  "selectedModel": {
    "tableName": "dws_xxx_wide",
    "grain": "一条业务单据一行"
  },
  "mappings": [],
  "sourceTables": [],
  "questions": []
}
```

## SQL Requirements

1. Use readable CTE structure.
2. Include source cleanup CTE if needed.
3. Include dictionary translation CTE if dictionary dependencies exist.
4. Include event/process aggregation or pivot CTE if event fields are mapped to wide table fields.
5. Include main join CTE.
6. Include final SELECT.
7. Add comments for uncertain logic, missing dictionaries, missing source tables, and second-phase fields.
8. Do not invent physical table names that are not provided, except the selected target table.
9. Use ANSI-like SQL where possible.

## Alibaba Cloud / OneData SQL Requirements

1. If generating DWD SQL, preserve atomic detail grain and avoid premature aggregation.
2. If generating DWS SQL, prefer reading DWD/DIM dependencies. If the context only provides ODS, add TODO comments saying this is a prototype path.
3. Separate CTEs by layer intention: ods_clean, dim_lookup, dwd_base, event_pivot, dws_select.
4. Do not directly join one-to-many event tables into a one-row target without aggregation or pivot.
5. For periodic snapshots, keep snapshot_date/stat_date.
6. For accumulating snapshots, output milestone time columns and explain update strategy.
7. For semi-additive measures, avoid summing across time in generated SQL.
8. For non-additive ratios, calculate numerator and denominator before ratio.

## Required Output JSON

```json
{
  "targetTable": "dws_xxx_wide",
  "sql": "WITH ... SELECT ...",
  "assumptions": [
    "假设主表一条业务单据一行"
  ],
  "warnings": [
    "状态字典表未提供，SQL 中保留 TODO"
  ],
  "oneDataNotes": [
    "正式 DWS 建议依赖 DWD 明细事实和 DIM 一致性维度"
  ],
  "qualityCheckSql": [
    {
      "ruleName": "主键不可为空",
      "sql": "select count(*) from dws_xxx_wide where id is null"
    }
  ]
}
```
