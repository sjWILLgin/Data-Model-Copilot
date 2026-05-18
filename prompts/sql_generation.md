# Prompt: SQL Draft Generation

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

Generate a development-reference DDL + INSERT SQL draft for the user-selected target model.

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

1. First design the final query logic as CTE + final SELECT.
2. Derive the target `CREATE TABLE` columns strictly from the final SELECT output columns, not from the raw target-field wish list.
3. Then generate `INSERT INTO target_table (...) WITH ... SELECT ...` using exactly the same final output columns.
4. The column order in `CREATE TABLE`, `insertColumns`, and final SELECT must be identical.
5. Use readable CTE structure.
6. Include source cleanup CTE if needed.
7. Include dictionary translation CTE if dictionary dependencies exist.
8. Include event/process aggregation or pivot CTE if event fields are mapped to wide table fields.
9. Include main join CTE.
10. Add comments for uncertain logic, missing dictionaries, missing source tables, and second-phase fields.
11. Do not invent physical table names that are not provided, except the selected target table.
12. Use ANSI-like SQL where possible.

## DDL Requirements

1. `createTableSql` must create the selected target table.
2. Every field in `createTableSql` must come from the final SELECT output.
3. Choose data types from source fields and transformation logic. Do not default everything to varchar.
4. Include column comments in Chinese.
5. Include table comment, layer, grain, and uncertainty TODO comments where needed.

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
  "outputColumns": [
    {
      "name": "business_order_id",
      "type": "bigint",
      "comment": "业务单据ID",
      "sourceExpression": "b.order_id",
      "logic": "来自主业务单据ID"
    }
  ],
  "createTableSql": "CREATE TABLE dws_xxx_wide (...) COMMENT 'xxx';",
  "insertSql": "INSERT INTO dws_xxx_wide (...) WITH ... SELECT ...",
  "finalSelectSql": "WITH ... SELECT ...",
  "sql": "INSERT INTO dws_xxx_wide (...) WITH ... SELECT ...",
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
