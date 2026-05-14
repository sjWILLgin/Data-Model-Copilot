# Prompt: Table Semantic Analysis

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

Analyze uploaded source tables and identify their business meaning, table type, business object/activity/event coverage, grain, risks, and questions.

## Alibaba Cloud / OneData Analysis Requirements

For each table, identify:

1. Whether it is likely ODS raw source, DIM candidate, DWD fact candidate, DWS summary candidate, ADS/application table, dictionary, master data, relationship/bridge, snapshot, log, or config table.
2. The related data domain and business process.
3. The business object or event represented by the table.
4. The table grain. Do not leave grain implicit.
5. Whether the table can become a DWD transaction fact, periodic snapshot fact, accumulating snapshot fact, or factless fact.
6. Whether the table can become a DIM conformed dimension.
7. Whether fields indicate current attributes, historical attributes, effective dates, or status history.
8. Whether table usage would violate ODS-to-ADS direct stitching principles.

## Input JSON

```json
{
  "businessDomain": "通用业务域 / 销售过程 / 供应链 / 财务 / 人资 / 用人费用 / 产品 / 主数据 / ...",
  "modelingMode": "目标表驱动 / 底表驱动 / 共创调研 / 模型评审",
  "sourceTables": [
    {
      "name": "ods_xxx",
      "comment": "表注释",
      "fields": [
        {
          "name": "field_name",
          "comment": "字段注释",
          "type": "varchar(64)",
          "primary": false,
          "nullable": "是",
          "enumText": "1:是;0:否",
          "sampleValue": ""
        }
      ]
    }
  ],
  "targetFields": []
}
```

## Domain Hints

Use the table name, comments, fields, enum values, and sample values to infer the domain. Examples:

1. Sales: order, customer, channel, store, salesperson, product, shipment, return, target, visit.
2. Supply chain: supplier, material, purchase, inbound, outbound, warehouse, inventory, transfer, batch, lot.
3. Finance: voucher, invoice, payment, reimbursement, expense, budget, cost center, account, contract.
4. HR: employee, person, org, position, attendance, hire, transfer, resignation, performance.
5. Labor cost: payroll, salary, bonus, social insurance, headcount, allocation, project.
6. Product: product, sku, spu, category, brand, price, promotion, lifecycle.
7. Master data: mdm, customer, supplier, product, org, employee, dictionary, golden record.

## Table Type Options

Use one of:

```json
[
  "业务对象表",
  "业务活动表",
  "事件/流程记录表",
  "状态快照表",
  "关系/桥接表",
  "字典表",
  "主数据表",
  "日志表",
  "配置表",
  "待判断表"
]
```

## Required Output JSON

```json
{
  "tables": [
    {
      "tableName": "ods_xxx",
      "businessName": "中文业务含义",
      "tableType": "业务活动表",
      "warehouseLayerGuess": "ODS来源表 / DWD候选明细事实",
      "domainGuess": "销售过程",
      "dataDomain": "交易域",
      "businessObject": "客户/商品/员工/供应商/组织/费用单/业务对象",
      "businessActivity": "下单/入库/付款/报销/入职/调价/主数据变更",
      "grain": "一条业务单据一行",
      "factTypeCandidate": "事务型事实表",
      "dimensionCandidate": false,
      "dwdDesignSuggestion": "可沉淀为 dwd_xxx_detail，保留原子业务过程",
      "dimDesignSuggestion": "如包含客户/商品/组织属性，应拆出或关联一致性维度",
      "primaryKeys": ["id"],
      "timeFields": ["created_time"],
      "statusFields": ["status"],
      "dictionaryFields": ["status"],
      "confidence": "中高",
      "evidence": ["包含订单号、客户、金额、下单时间"],
      "risks": ["状态字段缺少字典表"],
      "questions": [
        {
          "id": "Q_TABLE_001",
          "type": "粒度问题",
          "desc": "该表是否一条订单一行，还是订单明细一行？",
          "suggestion": "请确认主键和明细行关系",
          "owner": "数据产品",
          "status": "待确认"
        }
      ]
    }
  ],
  "businessProcesses": [
    {
      "processName": "业务过程名称",
      "involvedTables": ["ods_xxx"],
      "keyFields": ["id", "status", "occur_time"],
      "completeness": "完整 / 基本完整 / 不完整 / 待确认",
      "questions": []
    }
  ],
  "globalRisks": ["跨表粒度可能不一致"],
  "summary": "整体分析摘要"
}
```
