# Prompt: CDM Model Recommendation

Use with `aliyun_onedata_methodology.md` and `_shared_system.md`.

## Goal

Recommend candidate CDM models based on source table semantics, target fields, business domain, and modeling mode.

Important: You only recommend candidates. The final target model must be selected by the user in the UI.

## Modeling Principles

1. DIM models describe stable or slowly changing business objects.
2. DWD transaction fact models preserve atomic business activities.
3. DWD event/process fact models preserve process nodes and event history.
4. DWS wide/summary models serve reusable analytical themes.
5. ADS models serve specific applications and should not replace reusable middle-layer models.
6. If target fields mix grains, recommend either a clear main grain or split/bridge strategy.

## Alibaba Cloud / OneData Recommendation Procedure

Follow this sequence strictly:

1. Identify business domain and data domain.
2. Identify business objects such as customer, product, supplier, employee, organization, account, contract, material, SKU.
3. Identify business processes such as order, shipment, return, purchase, inbound, outbound, payment, reimbursement, payroll, product launch, master data change.
4. Determine whether each source table is ODS raw table, DIM candidate, DWD fact candidate, DWS summary candidate, dictionary, relationship/bridge, snapshot, or log/config table.
5. Declare the atomic grain of each candidate DWD fact. If the grain is unclear, create a question.
6. Decide fact type: transaction fact, periodic snapshot fact, accumulating snapshot fact, or factless fact.
7. Identify conformed dimensions and master data dependencies.
8. Identify public DWS topic models only after DWD/DIM dependencies are clear.
9. Check whether target fields mix grains. If yes, recommend split model or explicit aggregation/pivot/bridge logic.
10. Recommend candidate models, but do not decide final target model. The UI requires the user to single-select one target model.

## Layer Decision Rules

1. Recommend DIM when the table describes business object attributes and can be reused across facts.
2. Recommend DWD when the table records atomic business process events or transactions.
3. Recommend DWD event detail when the table records process nodes, status transitions, audit flows, approvals, or lifecycle events.
4. Recommend DWS when target fields describe a reusable analytical subject with a clear common grain.
5. Recommend ADS only when the model is report/application-specific and not suitable as a public middle-layer model.
6. Recommend bridge/relationship model when there is many-to-many relation, multi-value dimension, allocation, or product-bundle relation.

## Input JSON

```json
{
  "businessDomain": "销售过程",
  "modelingMode": "目标表驱动",
  "sourceTables": [],
  "tableSemantics": [],
  "targetFields": [],
  "knownQuestions": []
}
```

## Required Output JSON

```json
{
  "candidateModels": [
    {
      "id": "dws_wide",
      "tableName": "dws_sales_order_wide",
      "cnName": "销售订单主题宽表",
      "layer": "DWS",
      "modelType": "主题宽表/累积快照",
      "grain": "一条销售订单一行",
      "primaryKeySuggestion": ["order_id"],
      "sourceTables": ["ods_sales_order"],
      "dependsOnDwd": ["dwd_sales_order_detail"],
      "dependsOnDim": ["dim_customer", "dim_product"],
      "factType": "累积快照事实表",
      "measureAdditivity": "混合：金额可加，状态不可加",
      "recommendation": "高",
      "reason": "目标字段围绕订单、客户、商品、金额和状态，适合以订单为主粒度建设宽表",
      "risks": ["订单明细和订单头可能存在一对多，需要确认是否一行订单或一行订单明细"],
      "requiredConfirmations": ["确认目标模型主粒度"]
    }
  ],
  "preferredCandidateId": "dws_wide",
  "grainConflicts": [
    {
      "fieldName": "库存数量",
      "detectedGrain": "库存快照粒度",
      "risk": "与订单粒度不一致",
      "suggestion": "建议通过快照日期关联或另建库存快照模型"
    }
  ],
  "questions": [
    {
      "id": "Q_MODEL_001",
      "type": "粒度问题",
      "desc": "目标表最终是一条订单一行，还是一条订单明细一行？",
      "suggestion": "请确认主粒度后再生成正式 DDL",
      "owner": "数据产品",
      "status": "待确认"
    }
  ],
  "summary": "模型推荐摘要"
}
```

## Domain-Specific Hints

Sales:

1. Separate order header, order line, shipment, return, target, visit, and customer dimension grains.

Supply chain:

1. Separate purchase order, inbound/outbound transaction, transfer, inventory snapshot, supplier dimension, material/SKU dimension.

Finance:

1. Separate voucher, invoice, payment, reimbursement, budget, accounting period, cost center, account dimension.

HR and labor cost:

1. Separate employee/person dimension, org/position dimension, event fact, attendance fact, payroll period fact, allocation bridge.

Product and master data:

1. Separate product/SKU/SPU dimension, category hierarchy, price history, lifecycle event, golden record and relationship tables.
