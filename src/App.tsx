/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";

type Field = {
  table: string;
  tableComment?: string;
  name: string;
  comment: string;
  type: string;
  primary: boolean;
  nullable?: string;
  defaultValue?: string;
  enumText?: string;
  sampleValue?: string;
  semantic: string;
};

type SourceTable = {
  name: string;
  comment: string;
  fields: Field[];
};

type TargetField = {
  cn: string;
  en: string;
  kind: string;
  priority: "P0" | "P1" | "P2";
};

type Mapping = TargetField & {
  sourceTable: string;
  sourceField: string;
  logic: string;
  feasibility: string;
  confidence: string;
  status: string;
};

type Question = {
  id: string;
  type: string;
  desc: string;
  suggestion: string;
  owner: string;
  status: string;
  answer?: string;
};

type ModelPlan = {
  id: string;
  tableName: string;
  cnName: string;
  layer: string;
  modelType: string;
  grain: string;
  recommendation: string;
  selected: boolean;
};

type AiProvider = {
  id: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKeyRef: string;
  apiKey?: string;
  enabled: boolean;
};

type AiTaskKey = "semantic" | "reasoning" | "mapping" | "sql" | "document" | "review";

type AiConfig = {
  providers: AiProvider[];
  taskModels: Record<AiTaskKey, { providerId: string; model: string }>;
  strategy: string;
  uncertaintyPolicy: string;
  maxRounds: number;
  temperature: number;
};

type DatabaseConfig = {
  id: string;
  name: string;
  engine: string;
  environment: string;
  host: string;
  port: string;
  database: string;
  schema: string;
  username: string;
  passwordRef: string;
  odsPattern: string;
  enabled: boolean;
};

type AiApiResponse<T = unknown> = {
  mode: "mock" | "live";
  provider: string;
  model: string;
  promptName: string;
  result: T;
  rawText?: string;
};

type AiStatus = {
  mode: "idle" | "running" | "done" | "error";
  message: string;
};

type AiCallLog = {
  id: string;
  step: string;
  promptName: string;
  provider: string;
  model: string;
  taskKey: AiTaskKey;
  status: "running" | "done" | "error";
  startedAt: number;
  durationMs?: number;
  error?: string;
};

const targetSeed = "业务单据ID、业务对象ID、业务对象名称、业务发生时间、业务状态、来源渠道、所属组织、当前组织、负责人、完成时间、关闭原因、金额、数量、业务类型、最后更新时间";

const sampleDdl = `CREATE TABLE ods_business_order (
  id bigint COMMENT '业务单据ID',
  object_id bigint COMMENT '业务对象ID',
  object_name varchar(128) COMMENT '业务对象名称',
  occur_time datetime COMMENT '业务发生时间',
  channel varchar(64) COMMENT '来源渠道',
  org_id bigint COMMENT '所属组织ID',
  owner_name varchar(64) COMMENT '负责人',
  amount decimal(18,2) COMMENT '金额',
  quantity int COMMENT '数量',
  status tinyint COMMENT '业务状态 1新建 2处理中 3完成 4关闭',
  PRIMARY KEY (id)
) COMMENT='通用业务单据表';

CREATE TABLE ods_business_event_record (
  id bigint COMMENT '事件记录ID',
  order_id bigint COMMENT '业务单据ID',
  event_type tinyint COMMENT '事件类型 1创建 2审核 3完成 4关闭',
  event_result tinyint COMMENT '处理结果 1通过 2拒绝',
  event_time datetime COMMENT '事件发生时间',
  reason varchar(255) COMMENT '原因'
) COMMENT='通用业务事件记录表';`;

const businessDomains = ["通用业务域", "销售过程", "客户管理", "费用管理", "供应链", "人资管理"];
const modes = ["目标表驱动", "底表驱动", "共创调研", "模型评审"];
const stages = ["新建任务", "上传解析", "AI 预分析", "模型推荐", "字段映射", "疑问确认", "交付物"];
const coCreationStages = ["新建调研", "材料上传", "AI 问题生成", "模型共创", "映射复核", "疑问确认", "交付物"];
const stakeholderOptions = ["业务负责人", "数据 BP", "数据产品", "数据开发", "算法/分析师", "治理/口径Owner"];
const modeProfiles: Record<string, {
  title: string;
  intent: string;
  primaryInput: string;
  uploadFocus: string;
  aiAction: string;
  nextAction: string;
  output: string;
}> = {
  目标表驱动: {
    title: "从目标字段反推来源和口径",
    intent: "适合你已经知道要建设什么宽表、报表或分析主题，AI 会围绕目标字段寻找来源、补齐映射和疑问。",
    primaryInput: "目标字段 / 目标宽表诉求",
    uploadFocus: "上传能支撑这些目标字段的 ODS 表、字段清单或 DDL。",
    aiAction: "反推来源字段、取值逻辑、缺表缺口和口径疑问",
    nextAction: "上传来源表并反推映射",
    output: "目标模型、字段映射、待确认口径"
  },
  底表驱动: {
    title: "从 ODS 表识别可建设模型",
    intent: "适合你手里有一批系统底表，但还不确定应该沉淀哪些 DIM/DWD/DWS/CDM 模型。",
    primaryInput: "ODS 表结构 / 字段清单",
    uploadFocus: "优先上传完整底表结构，目标字段可以先写分析方向或留作后续补充。",
    aiAction: "识别业务对象、业务过程、事实/维度候选和可建设模型",
    nextAction: "上传 ODS 表并识别模型",
    output: "候选 CDM 模型、主粒度、字段建议"
  },
  共创调研: {
    title: "边补充业务口径边收敛模型",
    intent: "适合需求还比较模糊，需要业务、BP、产品、开发围绕疑问中心一起确认。",
    primaryInput: "业务问题 / 调研纪要 / 初始字段",
    uploadFocus: "上传已有表结构，也可以先粘贴调研得到的字段、口径和业务问题。",
    aiAction: "生成澄清问题、识别冲突口径，并在补充后重新复核映射",
    nextAction: "上传材料并生成调研疑问",
    output: "疑问清单、补充口径、复核后的映射"
  },
  模型评审: {
    title: "评审已有模型方案是否合理",
    intent: "适合你已经有模型、SQL、字段映射或 PRD，希望 AI 按 OneData/CDM 方法论挑问题。",
    primaryInput: "已有模型字段 / SQL / 设计说明",
    uploadFocus: "上传现有模型 DDL、字段映射表、SQL 草稿或来源表结构。",
    aiAction: "检查粒度混杂、字段来源、口径缺失、维度一致性和 SQL 风险",
    nextAction: "上传已有方案并开始评审",
    output: "评审问题、整改建议、风险清单"
  }
};
const coCreationSeed = `业务背景：希望梳理当前业务过程中的核心对象、关键状态流转、分析指标和中间层模型沉淀方式。

已知诉求：
1. 需要统一业务过程口径，避免不同团队重复取数。
2. 需要识别关键时间、状态、组织、负责人、金额/数量类字段。
3. 当前部分字段来源和枚举口径不确定，需要业务共创确认。

请 AI 先生成调研问题和待确认口径，不要直接替业务拍板。`;
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const aiPromptLabels: Record<string, string> = {
  table_semantic: "表语义识别",
  field_semantic: "字段语义识别",
  model_recommendation: "CDM 模型推荐",
  field_mapping: "字段映射判断",
  question_review: "疑问补充复核",
  sql_generation: "SQL 草稿生成",
  prd_generation: "PRD 文档生成"
};
const qwenTaskModels: Record<AiTaskKey, { providerId: string; model: string }> = {
  semantic: { providerId: "qwen", model: "qwen-plus" },
  reasoning: { providerId: "qwen", model: "qwq-plus" },
  mapping: { providerId: "qwen", model: "qwq-plus" },
  sql: { providerId: "qwen", model: "qwen3-max" },
  document: { providerId: "qwen", model: "qwen3-max" },
  review: { providerId: "qwen", model: "qwq-plus" }
};
const aiTaskLabels: Record<AiTaskKey, string> = {
  semantic: "表/字段语义识别",
  reasoning: "CDM 建模推理",
  mapping: "字段映射复核",
  sql: "SQL 草稿生成",
  document: "PRD/Excel 生成",
  review: "模型质量评审"
};

const defaultAiConfig: AiConfig = {
  providers: [
    { id: "openai", name: "OpenAI", type: "OpenAI Compatible", baseUrl: "https://api.openai.com/v1", apiKeyRef: "OPENAI_API_KEY", enabled: false },
    { id: "qwen", name: "通义千问", type: "OpenAI Compatible", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKeyRef: "DASHSCOPE_API_KEY", enabled: true },
    { id: "deepseek", name: "DeepSeek", type: "OpenAI Compatible", baseUrl: "https://api.deepseek.com/v1", apiKeyRef: "DEEPSEEK_API_KEY", enabled: false },
    { id: "private", name: "企业私有模型", type: "Private Gateway", baseUrl: "https://llm-gateway.example.com/v1", apiKeyRef: "PRIVATE_LLM_API_KEY", enabled: false }
  ],
  taskModels: qwenTaskModels,
  strategy: "标准模式",
  uncertaintyPolicy: "不确定即标注疑问",
  maxRounds: 3,
  temperature: 0.2
};

const defaultDatabaseConfigs: DatabaseConfig[] = [
  {
    id: "lakehouse_ods",
    name: "大数据 ODS 元数据源",
    engine: "MaxCompute / Hive / Hologres",
    environment: "开发环境",
    host: "metadata-gateway.example.com",
    port: "443",
    database: "data_warehouse",
    schema: "ods",
    username: "metadata_reader",
    passwordRef: "DW_METADATA_PASSWORD",
    odsPattern: "ods_*",
    enabled: true
  }
];

const mockOdsCatalog: SourceTable[] = [
  {
    name: "ods_sales_order",
    comment: "销售订单主表",
    fields: [
      { table: "ods_sales_order", name: "order_id", comment: "订单ID", type: "bigint", primary: true, semantic: "主键/外键" },
      { table: "ods_sales_order", name: "customer_id", comment: "客户ID", type: "bigint", primary: false, semantic: "客户字段" },
      { table: "ods_sales_order", name: "order_time", comment: "下单时间", type: "datetime", primary: false, semantic: "时间字段" },
      { table: "ods_sales_order", name: "order_amount", comment: "订单金额", type: "decimal(18,2)", primary: false, semantic: "金额字段" },
      { table: "ods_sales_order", name: "order_status", comment: "订单状态 1待支付 2已支付 3已关闭", type: "tinyint", primary: false, semantic: "状态/枚举" }
    ]
  },
  {
    name: "ods_sales_order_item",
    comment: "销售订单明细表",
    fields: [
      { table: "ods_sales_order_item", name: "item_id", comment: "明细ID", type: "bigint", primary: true, semantic: "主键/外键" },
      { table: "ods_sales_order_item", name: "order_id", comment: "订单ID", type: "bigint", primary: false, semantic: "主键/外键" },
      { table: "ods_sales_order_item", name: "sku_id", comment: "SKU ID", type: "bigint", primary: false, semantic: "商品/SKU字段" },
      { table: "ods_sales_order_item", name: "quantity", comment: "销售数量", type: "int", primary: false, semantic: "数量字段" },
      { table: "ods_sales_order_item", name: "item_amount", comment: "明细金额", type: "decimal(18,2)", primary: false, semantic: "金额字段" }
    ]
  },
  {
    name: "ods_inventory_snapshot",
    comment: "库存日快照表",
    fields: [
      { table: "ods_inventory_snapshot", name: "stat_date", comment: "统计日期", type: "date", primary: false, semantic: "时间字段" },
      { table: "ods_inventory_snapshot", name: "warehouse_id", comment: "仓库ID", type: "bigint", primary: false, semantic: "业务属性" },
      { table: "ods_inventory_snapshot", name: "sku_id", comment: "SKU ID", type: "bigint", primary: false, semantic: "商品/SKU字段" },
      { table: "ods_inventory_snapshot", name: "stock_qty", comment: "库存数量", type: "decimal(18,4)", primary: false, semantic: "数量字段" }
    ]
  },
  {
    name: "ods_finance_expense",
    comment: "费用报销单表",
    fields: [
      { table: "ods_finance_expense", name: "expense_id", comment: "报销单ID", type: "bigint", primary: true, semantic: "主键/外键" },
      { table: "ods_finance_expense", name: "cost_center_id", comment: "成本中心ID", type: "bigint", primary: false, semantic: "组织字段" },
      { table: "ods_finance_expense", name: "expense_amount", comment: "报销金额", type: "decimal(18,2)", primary: false, semantic: "金额字段" },
      { table: "ods_finance_expense", name: "accounting_period", comment: "会计期间", type: "varchar(16)", primary: false, semantic: "时间字段" }
    ]
  },
  {
    name: "ods_mdm_product",
    comment: "产品主数据表",
    fields: [
      { table: "ods_mdm_product", name: "sku_id", comment: "SKU ID", type: "bigint", primary: true, semantic: "商品/SKU字段" },
      { table: "ods_mdm_product", name: "spu_id", comment: "SPU ID", type: "bigint", primary: false, semantic: "商品/SKU字段" },
      { table: "ods_mdm_product", name: "category_name", comment: "品类名称", type: "varchar(128)", primary: false, semantic: "业务属性" },
      { table: "ods_mdm_product", name: "brand_name", comment: "品牌名称", type: "varchar(128)", primary: false, semantic: "业务属性" }
    ]
  }
];

function toSnake(input: string) {
  const dict: Record<string, string> = {
    报名: "apply",
    申请: "apply",
    业务: "business",
    单据: "document",
    对象: "object",
    发生: "occur",
    完成: "finish",
    关闭: "close",
    金额: "amount",
    数量: "quantity",
    类型: "type",
    负责人: "owner",
    人员: "member",
    申请人: "applicant",
    手机号: "mobile",
    时间: "time",
    渠道: "channel",
    岗位: "position",
    初试: "first_interview",
    复试: "second_interview",
    试岗: "trial",
    入职: "onboard",
    离职: "offboard",
    原因: "reason",
    当前: "current",
    组织: "org",
    产品组: "product_group",
    名称: "name",
    员工: "employee",
    状态: "status",
    id: "id",
    ID: "id"
  };
  let result = input;
  Object.entries(dict).forEach(([cn, en]) => {
    result = result.replace(new RegExp(cn, "g"), `_${en}_`);
  });
  return result
    .replace(/[^\w]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
}

function semanticOf(name: string, comment = "") {
  const text = `${name} ${comment}`.toLowerCase();
  if (/id|主键|编号/.test(text)) return "主键/外键";
  if (/time|date|时间|日期/.test(text)) return "时间字段";
  if (/status|state|result|flag|type|channel|状态|结果|是否|类型|渠道/.test(text)) return "状态/枚举";
  if (/org|dept|组织|部门|大区|省区/.test(text)) return "组织字段";
  if (/user|name|member|employee|人员|员工|申请人|姓名/.test(text)) return "人员字段";
  if (/amount|price|money|金额|费用/.test(text)) return "金额字段";
  if (/reason|remark|desc|原因|备注|说明/.test(text)) return "描述字段";
  if (/event|process|flow|节点|事件|流程/.test(text)) return "事件/流程字段";
  return "业务属性";
}

function fieldKind(name: string) {
  if (/时间|日期/.test(name)) return "时间";
  if (/状态|原因|渠道|是否|类型/.test(name)) return "枚举";
  if (/id|ID|编号/.test(name)) return "主键";
  if (/组织|岗位|产品组|申请人|员工|对象|负责人|客户|供应商|商品|门店/.test(name)) return "维度";
  if (/金额|数量|次数|件数|销量|费用/.test(name)) return "事实";
  return "事实";
}

function parseTargets(raw: string): TargetField[] {
  return raw
    .split(/[\n,，、\t]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((cn, index) => ({
      cn,
      en: toSnake(cn) || `field_${index + 1}`,
      kind: fieldKind(cn),
      priority: index < 8 ? "P0" : index < 13 ? "P1" : "P2"
    }));
}

function parseDdl(text: string): SourceTable[] {
  return extractCreateTableStatements(text).flatMap((statement) => {
    const tableMatch = statement.match(/create\s+table\s+(?:if\s+not\s+exists\s+)?([`"]?[\w.-]+[`"]?(?:\s*\.\s*[`"]?[\w.-]+[`"]?)?)\s*\(/i);
    const openIndex = statement.indexOf("(", tableMatch?.index || 0);
    const closeIndex = findMatchingParen(statement, openIndex);
    if (!tableMatch || openIndex < 0 || closeIndex < 0) return [];
    const rawName = tableMatch[1].replace(/[`"\s]/g, "");
    const tableName = rawName.split(".").pop() || rawName;
    const body = statement.slice(openIndex + 1, closeIndex);
    const suffix = statement.slice(closeIndex + 1);
    const tableComment = suffix.match(/comment\s*=?\s*['"]([^'"]+)['"]/i)?.[1] || inferTableComment(tableName);
    const primaryLine = body.match(/primary\s+key\s*\(([^)]+)\)/i)?.[1] || "";
    const primaryKeys = primaryLine.replace(/[`"\s]/g, "").split(",");
    const fields = splitSqlColumns(body)
      .map((line) => line.trim())
      .filter((line) => line && !/^(primary|key|index|unique|constraint|foreign)/i.test(line))
      .map((line) => {
        const match = line.match(/^[`"]?([\w]+)[`"]?\s+([a-zA-Z0-9_(),]+)(?:[\s\S]*?comment\s+['"]([^'"]+)['"])?/i);
        if (!match) return null;
        const field: Field = {
          table: tableName,
          tableComment,
          name: match[1],
          type: match[2],
          comment: match[3] || "",
          primary: primaryKeys.includes(match[1]),
          nullable: /not\s+null/i.test(line) ? "否" : "是",
          defaultValue: line.match(/default\s+([^,\s]+)/i)?.[1] || "",
          enumText: extractEnumText(match[3] || ""),
          semantic: semanticOf(match[1], match[3])
        };
        return field;
      })
      .filter((field): field is Field => Boolean(field));
    return fields.length ? [{ name: tableName, comment: tableComment, fields }] : [];
  });
}

function extractCreateTableStatements(text: string) {
  const statements: string[] = [];
  const regex = /create\s+table\b/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text))) {
    const start = match.index;
    const openIndex = text.indexOf("(", start);
    const closeIndex = findMatchingParen(text, openIndex);
    if (openIndex < 0 || closeIndex < 0) continue;
    let end = closeIndex + 1;
    while (end < text.length && text[end] !== ";" && !/^create\s+table\b/i.test(text.slice(end).trimStart())) end += 1;
    if (text[end] === ";") end += 1;
    statements.push(text.slice(start, end));
    regex.lastIndex = end;
  }
  return statements;
}

function findMatchingParen(text: string, openIndex: number) {
  if (openIndex < 0) return -1;
  let depth = 0;
  let quote = "";
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    const prev = text[index - 1];
    if ((char === "'" || char === '"' || char === "`") && prev !== "\\") {
      quote = quote === char ? "" : quote || char;
      continue;
    }
    if (quote) continue;
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function splitSqlColumns(body: string) {
  const columns: string[] = [];
  let current = "";
  let depth = 0;
  let quote = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    const prev = body[index - 1];
    if ((char === "'" || char === '"' || char === "`") && prev !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
    if (!quote) {
      if (char === "(") depth += 1;
      if (char === ")") depth -= 1;
      if (char === "," && depth === 0) {
        columns.push(current);
        current = "";
        continue;
      }
    }
    current += char;
  }
  if (current.trim()) columns.push(current);
  return columns;
}

function parseDelimited(text: string, filename: string): SourceTable[] {
  const rows = text
    .split(/\r?\n/)
    .map((line) => line.split(/,|\t/).map((cell) => cell.trim()))
    .filter((row) => row.some(Boolean));
  if (!rows.length) return [];
  const headers = rows[0].map((item) => item.toLowerCase());
  const find = (...keys: string[]) => headers.findIndex((header) => keys.some((key) => header.includes(key)));
  const tableIndex = find("table", "表英文名", "表名");
  const tableCommentIndex = find("table_comment", "表中文名", "表注释");
  const fieldIndex = find("field", "column", "字段英文名", "字段名");
  const typeIndex = find("type", "数据类型", "字段类型", "类型");
  const commentIndex = find("comment", "字段中文名", "字段注释", "注释", "中文", "说明");
  const primaryIndex = find("primary", "主键");
  const nullableIndex = find("nullable", "是否可空", "可空");
  const enumIndex = find("enum", "枚举");
  const sampleIndex = find("sample", "样例");
  const dataRows = fieldIndex >= 0 ? rows.slice(1) : rows;
  const grouped = new Map<string, Field[]>();
  dataRows.forEach((row, index) => {
    const table = tableIndex >= 0 ? row[tableIndex] || "uploaded_table" : filename.replace(/\.[^.]+$/, "");
    const tableComment = tableCommentIndex >= 0 ? row[tableCommentIndex] || inferTableComment(table) : inferTableComment(table);
    const name = fieldIndex >= 0 ? row[fieldIndex] : row[0] || `field_${index + 1}`;
    const comment = commentIndex >= 0 ? row[commentIndex] || "" : row[1] || "";
    const type = typeIndex >= 0 ? row[typeIndex] || "varchar" : "varchar";
    if (!name) return;
    const primaryText = primaryIndex >= 0 ? row[primaryIndex] : "";
    const field: Field = {
      table,
      tableComment,
      name,
      comment,
      type,
      primary: /是|y|yes|true|pk|主键/i.test(primaryText) || /id|主键/i.test(name + comment),
      nullable: nullableIndex >= 0 ? row[nullableIndex] || "" : "",
      enumText: enumIndex >= 0 ? row[enumIndex] || "" : extractEnumText(comment),
      sampleValue: sampleIndex >= 0 ? row[sampleIndex] || "" : "",
      semantic: semanticOf(name, comment)
    };
    grouped.set(table, [...(grouped.get(table) || []), field]);
  });
  return [...grouped.entries()].map(([name, fields]) => ({ name, comment: fields[0]?.tableComment || inferTableComment(name), fields }));
}

function extractEnumText(comment: string) {
  return /(\d+|[a-zA-Z_]+)\s*[:：=是-]\s*[\u4e00-\u9fa5\w]+/.test(comment) ? comment : "";
}

function inferTableComment(table: string) {
  if (/order|bill|apply|trade|sales|单据|订单|申请|交易/i.test(table)) return "业务单据/活动表";
  if (/record|process|event|log|flow|流程|事件|记录|日志/i.test(table)) return "事件/流程记录表";
  if (/customer|supplier|product|employee|user|member|org|dept|客户|供应商|商品|员工|人员|组织/i.test(table)) return "业务对象/维度表";
  if (/dict|字典/i.test(table)) return "枚举字典表";
  return "待确认业务表";
}

function tableType(table: SourceTable) {
  const text = `${table.name} ${table.comment}`;
  if (/dict|字典/i.test(text)) return "字典表";
  if (/record|process|event|log|流程|审批|事件|记录|日志/i.test(text)) return "事件/流程记录表";
  if (/customer|supplier|product|employee|user|member|org|dept|客户|供应商|商品|员工|人员|组织/i.test(text)) return "业务对象表";
  if (/apply|order|bill|trade|sales|申请|订单|单据|交易|销售/i.test(text)) return "业务活动表";
  return "待判断表";
}

function normalizeSelectedModel(plans: ModelPlan[]) {
  const selectedIndex = plans.findIndex((plan) => plan.selected);
  const fallbackIndex = plans.findIndex((plan) => plan.layer === "DWS");
  const targetIndex = selectedIndex >= 0 ? selectedIndex : Math.max(fallbackIndex, 0);
  return plans.map((plan, index) => ({ ...plan, selected: index === targetIndex }));
}

function loadAiConfig(): AiConfig {
  try {
    const forceQwenMigrationKey = "modelcreater.aiConfigReasoningQwen.v4";
    const raw = localStorage.getItem("modelcreater.aiConfig");
    if (!raw || localStorage.getItem(forceQwenMigrationKey) !== "true") {
      localStorage.setItem(forceQwenMigrationKey, "true");
      localStorage.setItem("modelcreater.aiConfig", JSON.stringify(defaultAiConfig));
      return defaultAiConfig;
    }
    const parsed = JSON.parse(raw) as AiConfig;
    return { ...defaultAiConfig, ...parsed, taskModels: { ...qwenTaskModels, ...parsed.taskModels } };
  } catch {
    return defaultAiConfig;
  }
}

function getTaskModel(config: AiConfig, taskKey: AiTaskKey) {
  const taskModel = config.taskModels[taskKey];
  const provider = config.providers.find((item) => item.id === taskModel.providerId) || config.providers[0];
  return { provider, model: taskModel.model };
}

function promptToTaskKey(promptName: string): AiTaskKey {
  if (promptName === "model_recommendation") return "reasoning";
  if (promptName === "field_mapping") return "mapping";
  if (promptName === "question_review") return "review";
  if (promptName === "sql_generation") return "sql";
  if (promptName === "prd_generation") return "document";
  return "semantic";
}

function isReasoningModel(model: string) {
  return /qwq|thinking|reason|r1|qwen3-(235b|30b)|qwen3-next/i.test(model);
}

function modelModeLabel(model: string) {
  if (isReasoningModel(model)) return "深度思考";
  if (/max|plus|3\.5|3\.6/i.test(model)) return "增强生成";
  return "快速响应";
}

function reasoningPhases(promptName: string) {
  if (promptName === "model_recommendation") return ["识别业务过程", "校验主粒度", "比较候选 CDM", "输出推荐理由"];
  if (promptName === "field_mapping") return ["理解目标字段", "检索来源字段", "推导取值逻辑", "标注置信度和疑问"];
  if (promptName === "question_review") return ["读取补充口径", "重判映射合理性", "更新待确认项", "返回复核结论"];
  if (promptName === "sql_generation") return ["整理映射口径", "组织 CTE 结构", "生成 SQL 草稿", "标注 TODO 风险"];
  if (promptName === "prd_generation") return ["汇总模型方案", "整理字段口径", "形成评审清单", "输出 PRD 草稿"];
  return ["读取表结构", "识别字段语义", "发现口径风险", "生成结构化结果"];
}

function loadDatabaseConfigs(): DatabaseConfig[] {
  try {
    const raw = localStorage.getItem("modelcreater.databaseConfigs");
    return raw ? JSON.parse(raw) as DatabaseConfig[] : defaultDatabaseConfigs;
  } catch {
    return defaultDatabaseConfigs;
  }
}

function recommendMappings(targets: TargetField[], tables: SourceTable[]): Mapping[] {
  const fields = tables.flatMap((table) => table.fields);
  return targets.map((target) => {
    const direct = fields.find((field) => scoreField(target.cn, field) > 4);
    const fuzzy = direct || fields.sort((a, b) => scoreField(target.cn, b) - scoreField(target.cn, a))[0];
    const score = fuzzy ? scoreField(target.cn, fuzzy) : 0;
    const feasible = score > 5 ? "可直接取数" : score > 2 ? "可加工生成" : /原因|状态|渠道/.test(target.cn) ? "需关联字典" : "需补充底表";
    return {
      ...target,
      sourceTable: fuzzy?.table || "暂无",
      sourceField: score > 1 ? fuzzy?.name || "暂无" : "暂无",
      logic: buildLogic(target.cn, fuzzy),
      feasibility: feasible,
      confidence: score > 5 ? "高" : score > 2 ? "中" : "低",
      status: feasible === "可直接取数" ? "已确认" : feasible === "需补充底表" ? "待补表" : "待确认"
    };
  });
}

function scoreField(target: string, field: Field) {
  const haystack = `${field.name} ${field.comment}`.toLowerCase();
  const keywords = target.split(/(?=[A-Z])|[_\s]/).concat(target.split(""));
  let score = 0;
  if (haystack.includes(target.toLowerCase())) score += 5;
  if (target.includes("id") && /id/.test(haystack)) score += 4;
  if (/时间/.test(target) && /time|date|时间|日期/.test(haystack)) score += 3;
  if (/组织/.test(target) && /org|dept|组织|部门/.test(haystack)) score += 3;
  if (/状态|结果/.test(target) && /status|result|flag|状态|结果/.test(haystack)) score += 3;
  keywords.forEach((keyword) => {
    if (keyword.length > 1 && haystack.includes(keyword.toLowerCase())) score += 1;
  });
  return score;
}

function buildLogic(target: string, field?: Field) {
  if (!field) return "当前来源不足，建议补充底表或标记二期";
  if (/事件|节点|阶段|完成|关闭|审核|处理/.test(target)) return `${field.table}.${field.name} 按事件/流程节点加工，需确认取首次、最新还是最终有效记录`;
  if (/原因|状态|渠道/.test(target)) return `${field.table}.${field.name} 取值后关联枚举字典翻译中文含义`;
  if (/当前|历史|发生时|所属/.test(target)) return `${field.table}.${field.name} 需确认当前口径和业务发生时口径`;
  return `直接取 ${field.table}.${field.name}`;
}

async function callAiPrompt<T = unknown>(promptName: string, context: unknown): Promise<AiApiResponse<T>> {
  const response = await fetch(`${API_BASE}/api/ai/${promptName}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(context)
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `AI request failed: ${response.status}`);
  }
  return response.json() as Promise<AiApiResponse<T>>;
}

function buildAiContext(tables: SourceTable[], targets: TargetField[], aiConfig: AiConfig, extra: Record<string, unknown> = {}) {
  return {
    sourceTables: tables,
    targetFields: targets,
    aiConfig,
    businessDomain: extra.domain,
    modelingMode: extra.mode,
    ...extra
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function pickString(source: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return fallback;
}

function mapAiMappings(result: unknown, fallback: Mapping[]): Mapping[] {
  const record = asRecord(result);
  const rows = asArray(record.mappings).length ? asArray(record.mappings) : asArray(record.updatedMappings);
  if (!rows.length) return [];
  return rows.map((item, index) => {
    const row = asRecord(item);
    const targetName = pickString(row, ["targetFieldName", "targetField", "targetCn", "cn", "name"]);
    const matched = fallback.find((mapping) => [mapping.cn, mapping.en].includes(targetName)) || fallback[index] || fallback[0];
    const cn = targetName || matched?.cn || `目标字段${index + 1}`;
    return {
      cn,
      en: pickString(row, ["suggestedEnglishName", "englishName", "targetEnglishName", "en"], matched?.en || toSnake(cn) || `field_${index + 1}`),
      kind: pickString(row, ["fieldType", "kind", "semanticType"], matched?.kind || fieldKind(cn)),
      priority: matched?.priority || (index < 8 ? "P0" : index < 13 ? "P1" : "P2"),
      sourceTable: pickString(row, ["sourceTable", "sourceTableName", "table"], matched?.sourceTable || "暂无"),
      sourceField: pickString(row, ["sourceField", "sourceFieldName", "field"], matched?.sourceField || "暂无"),
      logic: pickString(row, ["logic", "mappingLogic", "transformLogic", "calculationLogic"], matched?.logic || "需结合业务口径确认取值逻辑"),
      feasibility: pickString(row, ["feasibility", "availability", "canBuild"], matched?.feasibility || "需业务确认"),
      confidence: pickString(row, ["confidence", "confidenceLevel"], matched?.confidence || "中"),
      status: pickString(row, ["status", "reviewStatus"], matched?.status || "待确认")
    };
  });
}

function mapAiModelPlans(result: unknown, fallback: ModelPlan[]): ModelPlan[] {
  const record = asRecord(result);
  const rows = asArray(record.candidateModels).length ? asArray(record.candidateModels) : asArray(record.models);
  if (!rows.length) return [];
  const preferredId = asString(record.preferredCandidateId);
  return rows.map((item, index) => {
    const row = asRecord(item);
    const id = pickString(row, ["id", "candidateId"], fallback[index]?.id || `ai_model_${index + 1}`);
    return {
      id,
      tableName: pickString(row, ["tableName", "modelTableName", "name"], fallback[index]?.tableName || `dws_ai_model_${index + 1}`),
      cnName: pickString(row, ["cnName", "chineseName", "modelCnName"], fallback[index]?.cnName || "AI 推荐模型"),
      layer: pickString(row, ["layer", "modelLayer"], fallback[index]?.layer || "DWS"),
      modelType: pickString(row, ["modelType", "type"], fallback[index]?.modelType || "主题宽表"),
      grain: pickString(row, ["grain", "dataGrain"], fallback[index]?.grain || "待确认主粒度"),
      recommendation: pickString(row, ["recommendation", "recommendLevel", "score"], fallback[index]?.recommendation || "AI推荐"),
      selected: preferredId ? id === preferredId : Boolean(row.selected) || (!fallback.some((plan) => plan.selected) && index === 0) || fallback[index]?.selected || false
    };
  });
}

function mapAiQuestions(result: unknown): Question[] {
  const record = asRecord(result);
  const rows = [
    ...asArray(record.questions),
    ...asArray(record.remainingQuestions),
    ...asArray(record.risks),
    ...asArray(record.globalRisks),
    ...asArray(record.mappings).flatMap((item) => asArray(asRecord(item).questions))
  ];
  return rows.map((item, index) => {
    const row = asRecord(item);
    const type = pickString(row, ["type", "riskType", "category"], "AI疑问");
    const desc = pickString(row, ["desc", "description", "question", "risk"], "");
    if (!desc) return null;
    return {
      id: pickString(row, ["id", "questionId"], `AI${String(index + 1).padStart(3, "0")}`),
      type,
      desc,
      suggestion: pickString(row, ["suggestion", "recommendation", "advice"], "建议业务方补充后再复核"),
      owner: pickString(row, ["owner", "assignee"], "数据产品/业务方"),
      status: pickString(row, ["status"], "待确认")
    };
  }).filter((question): question is Question => Boolean(question));
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : "未知错误";
}

function logAiFailure(step: string, error: unknown) {
  console.error(`[ModelFlow AI Error] ${step}`, error);
}

function App() {
  const [activeStage, setActiveStage] = useState(0);
  const [taskName, setTaskName] = useState("通用业务过程分析模型");
  const [domain, setDomain] = useState("通用业务域");
  const [mode, setMode] = useState("目标表驱动");
  const [expectedLayer, setExpectedLayer] = useState("让 AI 判断");
  const [targetRaw, setTargetRaw] = useState(targetSeed);
  const [researchNotes, setResearchNotes] = useState(coCreationSeed);
  const [researchGoal, setResearchGoal] = useState("先形成调研问题清单，再共创确认 CDM 模型和字段映射");
  const [stakeholders, setStakeholders] = useState<string[]>(["业务负责人", "数据 BP", "数据产品"]);
  const [ddlText, setDdlText] = useState(sampleDdl);
  const [tables, setTables] = useState<SourceTable[]>(parseDdl(sampleDdl));
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [modelPlans, setModelPlans] = useState<ModelPlan[]>([]);
  const [aiMappings, setAiMappings] = useState<Mapping[] | null>(null);
  const [aiStatus, setAiStatus] = useState<AiStatus>({ mode: "idle", message: "" });
  const [aiCalls, setAiCalls] = useState<AiCallLog[]>([]);
  const [generatedSql, setGeneratedSql] = useState("");
  const [generatedPrd, setGeneratedPrd] = useState("");
  const [aiConfig, setAiConfig] = useState<AiConfig>(() => loadAiConfig());
  const [databaseConfigs, setDatabaseConfigs] = useState<DatabaseConfig[]>(() => loadDatabaseConfigs());
  const [selectedOdsTables, setSelectedOdsTables] = useState<string[]>([]);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [reanalysisStep, setReanalysisStep] = useState(-1);

  const targets = useMemo(() => parseTargets(targetRaw), [targetRaw]);
  const baseMappings = useMemo(() => recommendMappings(targets, tables), [targets, tables]);
  const mappings = useMemo(() => aiMappings || [], [aiMappings]);
  const fieldCount = tables.reduce((sum, table) => sum + table.fields.length, 0);
  const isReanalyzing = reanalysisStep >= 0;
  const modeProfile = modeProfiles[mode] || modeProfiles["目标表驱动"];
  const isCoCreation = mode === "共创调研";
  const visibleStages = isCoCreation ? coCreationStages : stages;
  const coCreationContext = { researchGoal, researchNotes, stakeholders };

  useEffect(() => {
    localStorage.setItem("modelcreater.aiConfig", JSON.stringify(aiConfig));
  }, [aiConfig]);

  useEffect(() => {
    localStorage.setItem("modelcreater.databaseConfigs", JSON.stringify(databaseConfigs));
  }, [databaseConfigs]);

  const invokeAiPrompt = async <T,>(step: string, promptName: string, context: unknown): Promise<AiApiResponse<T>> => {
    const taskKey = promptToTaskKey(promptName);
    const { provider, model } = getTaskModel(aiConfig, taskKey);
    const id = `${promptName}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const startedAt = Date.now();
    const nextCall: AiCallLog = {
      id,
      step,
      promptName,
      provider: provider?.name || "未配置供应商",
      model,
      taskKey,
      status: "running",
      startedAt
    };
    setAiCalls((current) => [nextCall, ...current].slice(0, 12));
    try {
      const result = await callAiPrompt<T>(promptName, context);
      setAiCalls((current) => current.map((item) => item.id === id ? {
        ...item,
        provider: result.provider,
        model: result.model,
        status: "done",
        durationMs: Date.now() - startedAt
      } : item));
      return result;
    } catch (error) {
      const message = getErrorMessage(error);
      setAiCalls((current) => current.map((item) => item.id === id ? {
        ...item,
        status: "error",
        durationMs: Date.now() - startedAt,
        error: message
      } : item));
      throw error;
    }
  };

  const handleAnalyze = async () => {
    const parsed = parseDdl(ddlText);
    const nextTables = parsed.length ? mergeTables(tables, parsed) : tables;
    if (parsed.length) setTables(nextTables);
    setAiMappings(null);
    setQuestions([]);
    setGeneratedSql("");
    setGeneratedPrd("");
    setIsAnalyzing(true);
    setActiveStage(2);
    setAiStatus({ mode: "running", message: "正在调用千问进行表语义、字段语义和字段映射预分析..." });
    try {
      const [tableResult, fieldResult, mappingResult] = await Promise.all([
        invokeAiPrompt(isCoCreation ? "AI 调研问题生成" : "AI 预分析", "table_semantic", buildAiContext(nextTables, targets, aiConfig, { taskName, domain, mode, modeProfile, coCreationContext })),
        invokeAiPrompt(isCoCreation ? "AI 调研问题生成" : "AI 预分析", "field_semantic", buildAiContext(nextTables, targets, aiConfig, { taskName, domain, mode, modeProfile, coCreationContext })),
        invokeAiPrompt(isCoCreation ? "AI 调研问题生成" : "AI 预分析", "field_mapping", buildAiContext(nextTables, targets, aiConfig, { taskName, domain, mode, modeProfile, coCreationContext, selectedModel: modelPlans.find((plan) => plan.selected) || null }))
      ]);
      const nextMappings = mapAiMappings(mappingResult.result, recommendMappings(targets, nextTables));
      if (nextMappings.length) setAiMappings(nextMappings);
      const nextQuestions = [
        ...mapAiQuestions(tableResult.result),
        ...mapAiQuestions(fieldResult.result),
        ...mapAiQuestions(mappingResult.result)
      ];
      if (nextQuestions.length) setQuestions((current) => mergeQuestions(nextQuestions, current));
      setAiStatus({ mode: "done", message: `千问预分析完成：${tableResult.provider}/${tableResult.model}` });
    } catch (error) {
      logAiFailure("预分析", error);
      setAiStatus({ mode: "error", message: `大模型预分析失败，未生成任何替代结果。请查看浏览器控制台和后端日志：${getErrorMessage(error)}` });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const parsedTables: SourceTable[] = [];
    for (const file of files) {
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (ext === "xlsx" || ext === "xls") {
        parsedTables.push(...(await parseExcelFile(file)));
      } else {
        const text = await file.text();
        parsedTables.push(...(parseDdl(text).length ? parseDdl(text) : parseDelimited(text, file.name)));
      }
    }
    if (parsedTables.length) {
      setTables(mergeTables(tables, parsedTables));
      setUploadedFiles([...uploadedFiles, ...files.map((file) => file.name)]);
      setActiveStage(1);
    }
    event.target.value = "";
  };

  const handleDownloadTemplate = () => {
    downloadStructureTemplate();
  };

  const handleQuestionChange = (id: string, patch: Partial<Question>) => {
    setQuestions((current) => current.map((question) => question.id === id ? { ...question, ...patch } : question));
  };

  const handleReanalyzeQuestions = () => {
    const steps = [0, 1, 2, 3, 4];
    setReanalysisStep(0);
    steps.slice(1).forEach((step) => {
      window.setTimeout(() => setReanalysisStep(step), step * 650);
    });
    window.setTimeout(async () => {
      try {
        const result = await invokeAiPrompt("疑问中心复核", "question_review", buildAiContext(tables, targets, aiConfig, {
          taskName,
          domain,
          mode,
          modeProfile,
          coCreationContext,
          selectedModel: modelPlans.find((plan) => plan.selected) || null,
          mappings,
          questions
        }));
        const nextMappings = mapAiMappings({ mappings: (result.result as { updatedMappings?: unknown[] }).updatedMappings }, mappings);
        if (nextMappings.length) setAiMappings(nextMappings);
        const nextQuestions = mapAiQuestions(result.result);
        if (nextQuestions.length) setQuestions((current) => mergeQuestions(nextQuestions, current));
        setAiStatus({ mode: "done", message: `千问完成字段映射复核：${result.provider}/${result.model}` });
        setActiveStage(4);
      } catch (error) {
        logAiFailure("疑问复核", error);
        setAiStatus({ mode: "error", message: `大模型复核失败，未更新字段映射。请查看浏览器控制台和后端日志：${getErrorMessage(error)}` });
      } finally {
        setReanalysisStep(-1);
      }
    }, 3600);
  };

  const handleGoModelRecommendations = async () => {
    setAiStatus({ mode: "running", message: "正在调用千问推荐 CDM 候选模型..." });
    try {
      const result = await invokeAiPrompt(isCoCreation ? "模型共创推荐" : "CDM 模型推荐", "model_recommendation", buildAiContext(tables, targets, aiConfig, { taskName, domain, mode, modeProfile, coCreationContext, questions }));
      const nextPlans = mapAiModelPlans(result.result, modelPlans);
      if (nextPlans.length) setModelPlans(normalizeSelectedModel(nextPlans));
      setAiStatus({ mode: "done", message: `千问模型推荐完成：${result.provider}/${result.model}` });
      setActiveStage(3);
    } catch (error) {
      logAiFailure("模型推荐", error);
      setAiStatus({ mode: "error", message: `大模型模型推荐失败，未生成任何替代推荐。请查看浏览器控制台和后端日志：${getErrorMessage(error)}` });
    }
  };

  const handleGoFieldMapping = async () => {
    setAiStatus({ mode: "running", message: "正在调用千问生成字段映射..." });
    try {
      const result = await invokeAiPrompt("字段映射工作台", "field_mapping", buildAiContext(tables, targets, aiConfig, {
        taskName,
        domain,
        mode,
        modeProfile,
        coCreationContext,
        selectedModel: modelPlans.find((plan) => plan.selected) || null,
        questions
      }));
      const nextMappings = mapAiMappings(result.result, baseMappings);
      if (nextMappings.length) setAiMappings(nextMappings);
      const nextQuestions = mapAiQuestions(result.result);
      if (nextQuestions.length) setQuestions((current) => mergeQuestions(nextQuestions, current));
      setAiStatus({ mode: "done", message: `千问字段映射完成：${result.provider}/${result.model}` });
      setActiveStage(4);
    } catch (error) {
      logAiFailure("字段映射", error);
      setAiStatus({ mode: "error", message: `大模型字段映射失败，未生成任何替代映射。请查看浏览器控制台和后端日志：${getErrorMessage(error)}` });
    }
  };

  const handleGenerateDeliverables = async () => {
    const selectedModel = modelPlans.find((plan) => plan.selected);
    if (!selectedModel) {
      setAiStatus({ mode: "error", message: "请先完成 CDM 模型推荐，并单选一个目标模型后再生成交付物。" });
      return;
    }
    setAiStatus({ mode: "running", message: "正在调用千问生成 SQL 草稿和 PRD..." });
    try {
      const [sqlResult, prdResult] = await Promise.all([
        invokeAiPrompt("交付物生成", "sql_generation", buildAiContext(tables, targets, aiConfig, { taskName, domain, mode, modeProfile, coCreationContext, selectedModel, mappings, questions })),
        invokeAiPrompt("交付物生成", "prd_generation", buildAiContext(tables, targets, aiConfig, { taskName, domain, mode, modeProfile, coCreationContext, selectedModel, modelPlans, mappings, questions }))
      ]);
      const sql = (sqlResult.result as { sql?: string }).sql;
      const markdown = (prdResult.result as { markdown?: string }).markdown;
      if (sql) setGeneratedSql(sql);
      if (markdown) setGeneratedPrd(markdown);
      setAiStatus({ mode: "done", message: `千问交付物生成完成：${sqlResult.provider}/${sqlResult.model}` });
      setActiveStage(6);
    } catch (error) {
      logAiFailure("交付物生成", error);
      setAiStatus({ mode: "error", message: `大模型交付物生成失败，未生成任何替代交付物。请查看浏览器控制台和后端日志：${getErrorMessage(error)}` });
    }
  };

  const handleModelPlanChange = (id: string, patch: Partial<ModelPlan>) => {
    setModelPlans((current) => normalizeSelectedModel(current.map((plan) => plan.id === id ? { ...plan, ...patch } : { ...plan, selected: patch.selected ? false : plan.selected })));
  };

  const handleAiConfigChange = (nextConfig: AiConfig) => {
    setAiConfig(nextConfig);
  };

  const handleDatabaseConfigsChange = (nextConfigs: DatabaseConfig[]) => {
    setDatabaseConfigs(nextConfigs);
  };

  const handleSelectOdsTable = (tableName: string, checked: boolean) => {
    setSelectedOdsTables((current) => checked ? [...new Set([...current, tableName])] : current.filter((name) => name !== tableName));
  };

  const handleImportSelectedOdsTables = () => {
    const selectedTables = mockOdsCatalog.filter((table) => selectedOdsTables.includes(table.name));
    if (!selectedTables.length) return;
    setTables((current) => mergeTables(current, selectedTables));
    setUploadedFiles((current) => [...current, `ODS元数据选择 ${selectedTables.length} 张表`]);
    setActiveStage(1);
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p className="eyebrow">ModelFlow / Data Model Copilot</p>
          <h1>智能中间层建模工作台</h1>
          <p className="hero-copy">从 ODS 表结构、目标字段到 CDM 模型推荐、字段映射、疑问确认和交付物输出的可交互前端原型。</p>
        </div>
        <div className="hero-card">
          <span>当前任务</span>
          <strong>{taskName}</strong>
          <small>{domain} · {mode} · {expectedLayer}</small>
          <button className="settings-button" onClick={() => setIsAiSettingsOpen(true)}>{getTaskModel(aiConfig, "semantic").provider?.name} · AI 全局配置</button>
        </div>
      </section>

      {isAiSettingsOpen && (
        <div className="settings-overlay" role="dialog" aria-modal="true">
          <div className="settings-backdrop" onClick={() => setIsAiSettingsOpen(false)} />
          <aside className="settings-drawer">
            <div className="settings-head">
              <div>
                <h2>AI 全局配置</h2>
                <p>配置一次后，预分析、模型推荐、字段映射复核和交付生成都会复用这套模型策略。</p>
              </div>
              <button className="secondary-button" onClick={() => setIsAiSettingsOpen(false)}>关闭</button>
            </div>
            <GlobalConfigCenter aiConfig={aiConfig} onAiChange={handleAiConfigChange} databaseConfigs={databaseConfigs} onDatabaseChange={handleDatabaseConfigsChange} />
          </aside>
        </div>
      )}

      <nav className="stage-nav">
        {visibleStages.map((stage, index) => (
          <button className={index === activeStage ? "active" : ""} key={stage} onClick={() => setActiveStage(index)}>
            <span>{index + 1}</span>{stage}
          </button>
        ))}
      </nav>

      <section className="dashboard-grid">
        <Metric label="来源表" value={tables.length} note="已解析" />
        <Metric label="来源字段" value={fieldCount} note="含语义识别" />
        <Metric label="目标字段" value={targets.length} note="待映射" />
        <Metric label="待确认问题" value={questions.filter((q) => !["已解决", "已确认", "二期处理", "不纳入本期"].includes(q.status)).length} note="AI 标注" />
      </section>

      <AiStatusBanner status={aiStatus} config={aiConfig} />
      <AiCallDetails calls={aiCalls} />

      {activeStage === 0 && (
        <Panel title="新建模型任务" subtitle="选择不同建模模式后，页面输入重点、AI 推理目标和下一步动作会随之变化。">
          <div className="form-grid">
            <label>任务名称<input value={taskName} onChange={(e) => setTaskName(e.target.value)} /></label>
            <label>业务域<select value={domain} onChange={(e) => setDomain(e.target.value)}>{businessDomains.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>建模模式<select value={mode} onChange={(e) => setMode(e.target.value)}>{modes.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label>期望层级<select value={expectedLayer} onChange={(e) => setExpectedLayer(e.target.value)}>{["DIM", "DWD", "DWS", "ADS", "让 AI 判断"].map((item) => <option key={item}>{item}</option>)}</select></label>
          </div>
          <ModeGuide profile={modeProfile} mode={mode} />
          {isCoCreation && (
            <CoCreationSetup
              goal={researchGoal}
              notes={researchNotes}
              stakeholders={stakeholders}
              onGoalChange={setResearchGoal}
              onNotesChange={setResearchNotes}
              onStakeholdersChange={setStakeholders}
            />
          )}
          <label className="wide-label">{modeProfile.primaryInput}<textarea value={targetRaw} onChange={(e) => setTargetRaw(e.target.value)} /></label>
          <div className="actions"><button onClick={() => setActiveStage(1)}>{modeProfile.nextAction}</button></div>
        </Panel>
      )}

      {activeStage === 1 && (
        <Panel title="表结构上传与解析" subtitle={modeProfile.uploadFocus}>
          <div className="mode-inline-card">
            <b>{mode} · AI 本轮会做什么</b>
            <span>{modeProfile.aiAction}</span>
            <small>预期产出：{modeProfile.output}</small>
          </div>
          {isCoCreation && <CoCreationSnapshot goal={researchGoal} notes={researchNotes} stakeholders={stakeholders} />}
          <div className="template-guide">
            <div>
              <h3>推荐用模板填写表结构</h3>
              <p>模板包含字段清单、表级信息、枚举字典和填写说明，适合没有标准 DDL、只有 Excel 梳理材料的情况。</p>
            </div>
            <button className="secondary-button" onClick={handleDownloadTemplate}>下载表结构模板</button>
          </div>
          <div className="upload-strip">
            <label className="upload-card">
              <input multiple type="file" accept=".sql,.txt,.csv,.tsv,.xlsx,.xls" onChange={handleFiles} />
              <strong>上传表结构或字段清单</strong>
              <span>点击选择文件，解析后会进入下方来源表池</span>
            </label>
            <div className="file-list">
              <b>已上传文件</b>
              {uploadedFiles.length ? uploadedFiles.map((name) => <span key={name}>{name}</span>) : <span>还没有上传，先试试 Excel 或 SQL 文件。</span>}
            </div>
          </div>
          <OdsCatalogSelector
            configs={databaseConfigs}
            selected={selectedOdsTables}
            onSelect={handleSelectOdsTable}
            onImport={handleImportSelectedOdsTables}
          />
          <div className="ddl-help">
            <b>多表 DDL 粘贴规则</b>
            <span>可以一次粘贴多个 `CREATE TABLE`，每段用英文分号 `;` 结束最稳；没有分号时，系统也会按下一个 `CREATE TABLE` 自动识别。</span>
            <span>支持空行和注释分隔，例如 `-- 表 A`、`-- 表 B`；字段类型里的括号如 `varchar(64)`、`decimal(18,2)` 不会被误拆。</span>
          </div>
          <label className="wide-label">也可以粘贴一个或多个建表语句<textarea value={ddlText} onChange={(e) => setDdlText(e.target.value)} /></label>
          <div className="actions split-actions">
            <button className="secondary-button" onClick={() => setIsAiSettingsOpen(true)}>AI 全局配置</button>
            <button onClick={handleAnalyze}>按「{mode}」调用大模型</button>
          </div>
          <SourceTables tables={tables} />
        </Panel>
      )}

      {activeStage === 2 && (
        <Panel title={isCoCreation ? "AI 调研问题生成" : "AI 预分析报告"} subtitle={isCoCreation ? "共创调研会优先生成澄清问题和待确认口径，先让人补充，再进入模型共创。" : "先做语义识别和风险判断，不直接生成宽表。"}>
          {isAnalyzing && <AiRunningCard config={aiConfig} taskKey="semantic" text={isCoCreation ? "AI 正在结合调研材料生成澄清问题、口径冲突和共创议题..." : "AI 正在识别业务对象、事件过程、字段语义和粒度风险..."} />}
          {!isAnalyzing && aiStatus.mode === "done" && <Analysis tables={tables} mappings={mappings} />}
          {!isAnalyzing && aiStatus.mode === "error" && <AiErrorCard message={aiStatus.message} />}
          <div className="actions">
            <button onClick={isCoCreation ? () => setActiveStage(5) : handleGoModelRecommendations} disabled={aiStatus.mode !== "done"}>
              {isCoCreation ? "先进入疑问共创" : "查看 CDM 推荐"}
            </button>
          </div>
        </Panel>
      )}

      {activeStage === 3 && (
        <Panel title={isCoCreation ? "模型共创推荐" : "CDM 模型推荐"} subtitle={isCoCreation ? "结合疑问中心补充后的业务口径，推荐可共创确认的目标模型。" : "优先沉淀明细事实，再支撑主题宽表。"}>
          <ModelRecommendations plans={modelPlans} onChange={handleModelPlanChange} />
          <div className="method-card">建模约束：DWD 保留最细业务过程，DWS 面向分析主题做公共汇总或宽表；如果目标字段涉及多个业务粒度，需要先明确主粒度，再通过聚合、横向展开或桥接关系处理。</div>
          <div className="actions"><button onClick={handleGoFieldMapping}>进入字段映射</button></div>
        </Panel>
      )}

      {activeStage === 4 && (
        <Panel title="字段映射工作台" subtitle="目标字段、AI 推荐来源、取值逻辑、可行性和确认状态集中处理。">
          <MappingTable mappings={mappings} />
          <div className="actions"><button onClick={() => setActiveStage(5)}>处理疑问</button></div>
        </Panel>
      )}

      {activeStage === 5 && (
        <Panel title={isCoCreation ? "疑问共创中心" : "疑问确认中心"} subtitle={isCoCreation ? "业务、BP、产品、开发先补充调研口径，再让大模型进入模型共创推荐。" : "不确定即标注疑问，方便 BP、业务、产品和开发统一确认。"}>
          {isReanalyzing && <ReanalysisProgress activeStep={reanalysisStep} config={aiConfig} />}
          <QuestionTable questions={questions} onChange={handleQuestionChange} disabled={isReanalyzing} />
          <div className="actions split-actions">
            <button className="secondary-button" onClick={handleReanalyzeQuestions} disabled={isReanalyzing}>提交给大模型复核映射</button>
            {isCoCreation && <button className="secondary-button" onClick={handleGoModelRecommendations} disabled={isReanalyzing}>基于共创口径推荐模型</button>}
            <button onClick={handleGenerateDeliverables} disabled={isReanalyzing}>生成交付物</button>
          </div>
        </Panel>
      )}

      {activeStage === 6 && (
        <Panel title="交付物预览" subtitle="原型中先生成可复制的 PRD/DDL/SQL 草稿摘要，后续可接真实导出。">
          <Deliverables taskName={taskName} targets={targets} mappings={mappings} tables={tables} questions={questions} modelPlans={modelPlans} generatedSql={generatedSql} generatedPrd={generatedPrd} aiStatus={aiStatus} />
        </Panel>
      )}
    </main>
  );
}

async function parseExcelFile(file: File): Promise<SourceTable[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer);
  return workbook.SheetNames.flatMap((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    if (!rows.length) return [];
    const headers = Object.keys(rows[0]);
    const find = (...keys: string[]) => headers.find((header) => keys.some((key) => header.toLowerCase().includes(key) || header.includes(key)));
    const tableKey = find("table", "表英文名", "表名");
    const tableCommentKey = find("table_comment", "表中文名", "表注释");
    const fieldKey = find("field", "column", "字段英文名", "字段名");
    const typeKey = find("type", "数据类型", "字段类型", "类型");
    const commentKey = find("comment", "字段中文名", "字段注释", "注释", "中文", "说明");
    const primaryKey = find("primary", "主键");
    const nullableKey = find("nullable", "是否可空", "可空");
    const defaultKey = find("default", "默认值");
    const enumKey = find("enum", "枚举");
    const sampleKey = find("sample", "样例");
    if (!fieldKey) return [];
    const grouped = new Map<string, Field[]>();
    rows.forEach((row, index) => {
      const table = String((tableKey && row[tableKey]) || sheetName || "uploaded_table");
      const tableComment = String((tableCommentKey && row[tableCommentKey]) || inferTableComment(table));
      const name = String((fieldKey && row[fieldKey]) || row[headers[0]] || `field_${index + 1}`);
      const comment = String((commentKey && row[commentKey]) || row[headers[1]] || "");
      const type = String((typeKey && row[typeKey]) || "varchar");
      const primaryText = String((primaryKey && row[primaryKey]) || "");
      if (!name.trim()) return;
      grouped.set(table, [...(grouped.get(table) || []), {
        table,
        tableComment,
        name,
        comment,
        type,
        primary: /是|y|yes|true|pk|主键/i.test(primaryText) || /id|主键/i.test(name + comment),
        nullable: String((nullableKey && row[nullableKey]) || ""),
        defaultValue: String((defaultKey && row[defaultKey]) || ""),
        enumText: String((enumKey && row[enumKey]) || extractEnumText(comment)),
        sampleValue: String((sampleKey && row[sampleKey]) || ""),
        semantic: semanticOf(name, comment)
      }]);
    });
    return [...grouped.entries()].map(([name, fields]) => ({ name, comment: fields[0]?.tableComment || inferTableComment(name), fields }));
  });
}

function downloadStructureTemplate() {
  const fieldRows = [
    {
      "表英文名*": "ods_business_order",
      "表中文名/注释": "通用业务单据表",
      "字段英文名*": "id",
      "字段中文名/注释*": "业务单据ID",
      "数据类型*": "bigint",
      "是否主键": "是",
      "是否可空": "否",
      "默认值": "",
      "是否分区字段": "否",
      "枚举值说明": "",
      "样例值": "10001",
      "字段来源说明": "业务系统原始字段",
      "业务口径备注": "一条业务单据唯一标识"
    },
    {
      "表英文名*": "ods_business_order",
      "表中文名/注释": "通用业务单据表",
      "字段英文名*": "channel",
      "字段中文名/注释*": "来源渠道",
      "数据类型*": "varchar(64)",
      "是否主键": "否",
      "是否可空": "是",
      "默认值": "",
      "是否分区字段": "否",
      "枚举值说明": "1:线上;2:线下;3:人工录入",
      "样例值": "2",
      "字段来源说明": "业务系统",
      "业务口径备注": "需要确认是否关联公共渠道字典"
    },
    {
      "表英文名*": "ods_business_event_record",
      "表中文名/注释": "通用业务事件记录表",
      "字段英文名*": "event_time",
      "字段中文名/注释*": "事件发生时间",
      "数据类型*": "datetime",
      "是否主键": "否",
      "是否可空": "是",
      "默认值": "",
      "是否分区字段": "否",
      "枚举值说明": "",
      "样例值": "2026-05-12 10:00:00",
      "字段来源说明": "业务流程系统",
      "业务口径备注": "进入宽表时需确认取首次、最新还是最终有效时间"
    }
  ];
  const tableRows = [
    {
      "表英文名*": "ods_business_order",
      "表中文名/注释*": "通用业务单据表",
      "所属系统": "业务系统",
      "所属业务域": "通用业务域",
      "表类型": "业务活动表",
      "数据粒度": "一条业务单据一行",
      "更新频率": "实时/每日",
      "负责人": "数据产品",
      "补充说明": "用于判断目标模型主粒度"
    }
  ];
  const enumRows = [
    {
      "来源表*": "ods_business_order",
      "来源字段*": "channel",
      "枚举值*": "1",
      "中文含义*": "线上",
      "是否确认": "否",
      "备注": "如果已有公共字典表，可填写字典表名"
    }
  ];
  const readmeRows = [
    { "项目": "必填列", "说明": "字段清单 Sheet 中带 * 的列建议必填：表英文名、字段英文名、字段中文名/注释、数据类型。" },
    { "项目": "多表填写", "说明": "多张表写在同一个字段清单 Sheet 即可，用表英文名区分；也可以每个 Sheet 一张表。" },
    { "项目": "DDL 粘贴", "说明": "如果有标准建表语句，可直接在页面粘贴多个 CREATE TABLE，建议每个语句以英文分号 ; 结束。" },
    { "项目": "复杂情况", "说明": "枚举、分区、主键、样例值、业务口径备注都可以补充；没有的信息留空，不影响基础解析。" }
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(fieldRows), "字段清单");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tableRows), "表级信息");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(enumRows), "枚举字典");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(readmeRows), "填写说明");
  const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(data, "智能中间层建模_表结构填写模板.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function mergeTables(current: SourceTable[], next: SourceTable[]) {
  const map = new Map(current.map((table) => [table.name, table]));
  next.forEach((table) => {
    const existed = map.get(table.name);
    map.set(table.name, existed ? { ...existed, fields: dedupeFields([...existed.fields, ...table.fields]) } : table);
  });
  return [...map.values()];
}

function dedupeFields(fields: Field[]) {
  const map = new Map<string, Field>();
  fields.forEach((field) => map.set(`${field.table}.${field.name}`, field));
  return [...map.values()];
}

function mergeQuestions(next: Question[], current: Question[]) {
  const currentMap = new Map(current.map((question) => [question.id, question]));
  return next.map((question) => ({ ...question, ...currentMap.get(question.id) }));
}

function Metric({ label, value, note }: { label: string; value: number; note: string }) {
  return <div className="metric"><span>{label}</span><strong>{value}</strong><small>{note}</small></div>;
}

function AiStatusBanner({ status, config }: { status: AiStatus; config: AiConfig }) {
  if (status.mode === "idle") return null;
  const { provider, model } = getTaskModel(config, "semantic");
  return (
    <div className={`ai-status-banner ${status.mode}`}>
      <b>{status.mode === "running" ? "大模型处理中" : status.mode === "done" ? "大模型调用完成" : "大模型调用异常"}</b>
      <span>{status.message}</span>
      <small>当前默认模型：{provider?.name || "未配置"} / {model}</small>
    </div>
  );
}

function AiCallDetails({ calls }: { calls: AiCallLog[] }) {
  if (!calls.length) return null;
  const latest = calls[0];
  const runningCount = calls.filter((call) => call.status === "running").length;
  const phases = reasoningPhases(latest.promptName);
  return (
    <section className="ai-call-details">
      <div className="ai-call-head">
        <div>
          <b>大模型调用</b>
          <span>{runningCount ? `${runningCount} 个任务正在处理` : "最近一次调用已完成"}</span>
        </div>
        <strong>{latest.provider} / {latest.model}</strong>
      </div>
      <article className={`ai-call-current ${latest.status}`}>
        <div>
          <b>{aiPromptLabels[latest.promptName] || latest.promptName}</b>
          <span>{latest.step} · {aiTaskLabels[latest.taskKey]} · {modelModeLabel(latest.model)}</span>
        </div>
        <small>{latest.status === "running" ? "调用中..." : `耗时 ${((latest.durationMs || 0) / 1000).toFixed(1)}s`}</small>
        {isReasoningModel(latest.model) && (
          <ol className="reasoning-steps">
            {phases.map((phase, index) => (
              <li className={latest.status === "done" || index < 2 ? "done" : latest.status === "running" && index === 2 ? "active" : ""} key={phase}>
                <span>{index + 1}</span>{phase}
              </li>
            ))}
          </ol>
        )}
        {latest.error && <em>{latest.error}</em>}
      </article>
      <details className="ai-call-history">
        <summary>查看调用明细</summary>
        <div className="ai-call-grid">
          {calls.map((call) => (
            <article className={`ai-call-card ${call.status}`} key={call.id}>
              <div>
                <b>{aiPromptLabels[call.promptName] || call.promptName}</b>
                <span>{call.step}</span>
              </div>
              <small>{call.provider} / {call.model}</small>
              <small>{modelModeLabel(call.model)} · Prompt：{call.promptName}</small>
              <small>{call.status === "running" ? "调用中..." : `耗时 ${((call.durationMs || 0) / 1000).toFixed(1)}s`}</small>
              {call.error && <em>{call.error}</em>}
            </article>
          ))}
        </div>
      </details>
    </section>
  );
}

function AiErrorCard({ message }: { message: string }) {
  return (
    <div className="ai-error-card">
      <b>大模型调用失败，本步骤未产出结果</b>
      <span>{message}</span>
      <span>请打开浏览器控制台查看 `[ModelFlow AI Error]`，同时查看后端日志 `[modelcreater-backend] request failed`。</span>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="panel"><div className="panel-head"><div><h2>{title}</h2><p>{subtitle}</p></div></div>{children}</section>;
}

function ModeGuide({ mode, profile }: { mode: string; profile: typeof modeProfiles[string] }) {
  return (
    <div className="mode-guide">
      <div>
        <span className="mode-badge">{mode}</span>
        <h3>{profile.title}</h3>
        <p>{profile.intent}</p>
      </div>
      <div className="mode-guide-grid">
        <span>主输入：{profile.primaryInput}</span>
        <span>AI 推理：{profile.aiAction}</span>
        <span>产出重点：{profile.output}</span>
      </div>
    </div>
  );
}

function CoCreationSetup({ goal, notes, stakeholders, onGoalChange, onNotesChange, onStakeholdersChange }: {
  goal: string;
  notes: string;
  stakeholders: string[];
  onGoalChange: (value: string) => void;
  onNotesChange: (value: string) => void;
  onStakeholdersChange: (value: string[]) => void;
}) {
  const toggleStakeholder = (stakeholder: string) => {
    onStakeholdersChange(stakeholders.includes(stakeholder) ? stakeholders.filter((item) => item !== stakeholder) : [...stakeholders, stakeholder]);
  };
  return (
    <section className="co-creation-board">
      <div className="co-creation-head">
        <div>
          <span className="mode-badge">共创调研专属</span>
          <h3>先把“人”和“问题”放到模型前面</h3>
          <p>这个模式会把调研目标、会议纪要、参与角色一起发给大模型，先生成澄清问题，而不是直接拍板建模。</p>
        </div>
      </div>
      <div className="co-creation-grid">
        <label>本轮调研目标<input value={goal} onChange={(event) => onGoalChange(event.target.value)} /></label>
        <label className="wide-label">调研材料 / 会议纪要 / 已知口径<textarea value={notes} onChange={(event) => onNotesChange(event.target.value)} /></label>
      </div>
      <div className="stakeholder-picker">
        <b>参与角色</b>
        <div>
          {stakeholderOptions.map((stakeholder) => (
            <button className={stakeholders.includes(stakeholder) ? "stakeholder-chip selected" : "stakeholder-chip"} key={stakeholder} onClick={() => toggleStakeholder(stakeholder)} type="button">
              {stakeholder}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function CoCreationSnapshot({ goal, notes, stakeholders }: { goal: string; notes: string; stakeholders: string[] }) {
  return (
    <section className="co-creation-snapshot">
      <b>共创上下文会随本次 AI 调用一起提交</b>
      <span>调研目标：{goal}</span>
      <span>参与角色：{stakeholders.join("、") || "待选择"}</span>
      <small>材料摘要：{notes.slice(0, 120)}{notes.length > 120 ? "..." : ""}</small>
    </section>
  );
}

function SourceTables({ tables }: { tables: SourceTable[] }) {
  return <div className="table-cards">{tables.map((table) => <article className="table-card" key={table.name}><b>{table.name}</b><span>{table.comment} · {tableType(table)}</span><small>{table.fields.length} 个字段</small><div>{table.fields.slice(0, 8).map((field) => <em key={field.name}>{field.name} · {field.semantic}</em>)}</div></article>)}</div>;
}

function Analysis({ tables, mappings }: { tables: SourceTable[]; mappings: Mapping[] }) {
  const risks = mappings.filter((item) => item.status !== "已确认").length;
  return <div className="analysis-grid"><div><h3>表语义识别</h3>{tables.map((table) => <p key={table.name}><b>{table.name}</b>：{table.comment}，判断为 {tableType(table)}，置信度 {tableType(table) === "待判断表" ? "中" : "高"}。</p>)}</div><div><h3>建模风险提示</h3><p>字段映射中有 <b>{risks}</b> 个字段需要人工确认、补字典或补底表。</p><p>事件/流程类字段建议先沉淀 DWD 明细，再在 DWS 宽表中按明确规则聚合或横向展开。</p><p>会变化的维度字段需要显式确认当前口径与业务发生时口径。</p></div></div>;
}

function GlobalConfigCenter({ aiConfig, onAiChange, databaseConfigs, onDatabaseChange }: { aiConfig: AiConfig; onAiChange: (config: AiConfig) => void; databaseConfigs: DatabaseConfig[]; onDatabaseChange: (configs: DatabaseConfig[]) => void }) {
  return (
    <div className="global-config">
      <section>
        <h3>AI 模型配置</h3>
        <AiConfigCenter config={aiConfig} onChange={onAiChange} />
      </section>
      <section>
        <h3>数据库 / 元数据源配置</h3>
        <DatabaseConfigCenter configs={databaseConfigs} onChange={onDatabaseChange} />
      </section>
    </div>
  );
}

function DatabaseConfigCenter({ configs, onChange }: { configs: DatabaseConfig[]; onChange: (configs: DatabaseConfig[]) => void }) {
  const updateConfig = (id: string, patch: Partial<DatabaseConfig>) => {
    onChange(configs.map((config) => config.id === id ? { ...config, ...patch } : config));
  };
  const addConfig = () => {
    onChange([...configs, {
      id: `db_${Date.now()}`,
      name: "新的 ODS 元数据源",
      engine: "Hive / MaxCompute / Hologres / StarRocks",
      environment: "开发环境",
      host: "metadata-gateway.example.com",
      port: "443",
      database: "data_warehouse",
      schema: "ods",
      username: "metadata_reader",
      passwordRef: "DW_METADATA_PASSWORD",
      odsPattern: "ods_*",
      enabled: true
    }]);
  };
  return (
    <div className="ai-section">
      <div className="section-title-row">
        <div>
          <h3>连接配置</h3>
          <p>当前只保存元数据连接配置原型。生产环境密码应放后端密钥或环境变量中，前端只保存引用名。</p>
        </div>
        <button className="secondary-button" onClick={addConfig}>新增数据源</button>
      </div>
      <div className="db-config-list">
        {configs.map((config) => (
          <article className="db-config-card" key={config.id}>
            <label className="check-line"><input checked={config.enabled} type="checkbox" onChange={(event) => updateConfig(config.id, { enabled: event.target.checked })} />启用</label>
            <div className="db-config-grid">
              <label>连接名称<input value={config.name} onChange={(event) => updateConfig(config.id, { name: event.target.value })} /></label>
              <label>引擎类型<input value={config.engine} onChange={(event) => updateConfig(config.id, { engine: event.target.value })} /></label>
              <label>环境<select value={config.environment} onChange={(event) => updateConfig(config.id, { environment: event.target.value })}>{["开发环境", "测试环境", "生产只读", "生产审批"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label>Host / 网关<input value={config.host} onChange={(event) => updateConfig(config.id, { host: event.target.value })} /></label>
              <label>端口<input value={config.port} onChange={(event) => updateConfig(config.id, { port: event.target.value })} /></label>
              <label>Database / Project<input value={config.database} onChange={(event) => updateConfig(config.id, { database: event.target.value })} /></label>
              <label>Schema / Layer<input value={config.schema} onChange={(event) => updateConfig(config.id, { schema: event.target.value })} /></label>
              <label>只读账号<input value={config.username} onChange={(event) => updateConfig(config.id, { username: event.target.value })} /></label>
              <label>密码引用名<input value={config.passwordRef} onChange={(event) => updateConfig(config.id, { passwordRef: event.target.value })} /></label>
              <label>ODS 表匹配规则<input value={config.odsPattern} onChange={(event) => updateConfig(config.id, { odsPattern: event.target.value })} /></label>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function OdsCatalogSelector({ configs, selected, onSelect, onImport }: { configs: DatabaseConfig[]; selected: string[]; onSelect: (tableName: string, checked: boolean) => void; onImport: () => void }) {
  const activeConfig = configs.find((config) => config.enabled) || configs[0];
  return (
    <section className="ods-selector">
      <div className="ods-selector-head">
        <div>
          <h3>从 ODS 元数据目录选择表</h3>
          <p>当前为模拟元数据目录。未来后端连接大数据数据库后，这里会读取 ODS 层表清单；选择后只进入建模方案和人工复核，不直接写入 CDM。</p>
        </div>
        <button className="secondary-button" onClick={onImport} disabled={!selected.length}>导入选中 ODS 表</button>
      </div>
      <div className="metadata-source-chip">
        <b>{activeConfig?.name || "未配置数据源"}</b>
        <span>{activeConfig?.engine || "待配置"} · {activeConfig?.database || "-"} / {activeConfig?.schema || "-"} · {activeConfig?.odsPattern || "ods_*"}</span>
      </div>
      <div className="ods-table-grid">
        {mockOdsCatalog.map((table) => (
          <article className={selected.includes(table.name) ? "ods-table-card selected" : "ods-table-card"} key={table.name}>
            <label className="check-line">
              <input checked={selected.includes(table.name)} type="checkbox" onChange={(event) => onSelect(table.name, event.target.checked)} />
              选择
            </label>
            <b>{table.name}</b>
            <span>{table.comment} · {tableType(table)}</span>
            <small>{table.fields.length} 个字段：{table.fields.slice(0, 4).map((field) => field.name).join("、")}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function AiConfigCenter({ config, onChange }: { config: AiConfig; onChange: (config: AiConfig) => void }) {
  const [testingProviderId, setTestingProviderId] = useState("");
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const updateProvider = (id: string, patch: Partial<AiProvider>) => {
    onChange({ ...config, providers: config.providers.map((provider) => provider.id === id ? { ...provider, ...patch } : provider) });
  };
  const updateTaskModel = (taskKey: AiTaskKey, patch: Partial<{ providerId: string; model: string }>) => {
    onChange({ ...config, taskModels: { ...config.taskModels, [taskKey]: { ...config.taskModels[taskKey], ...patch } } });
  };
  const addProvider = () => {
    const id = `custom_${Date.now()}`;
    onChange({
      ...config,
      providers: [...config.providers, { id, name: "自定义模型网关", type: "OpenAI Compatible", baseUrl: "https://your-gateway.example.com/v1", apiKeyRef: "CUSTOM_LLM_API_KEY", apiKey: "", enabled: true }]
    });
  };
  const testProvider = async (provider: AiProvider) => {
    const model = Object.values(config.taskModels).find((taskModel) => taskModel.providerId === provider.id)?.model || "qwen-plus";
    setTestingProviderId(provider.id);
    setTestResults((current) => ({ ...current, [provider.id]: { ok: false, message: "正在测试连通性..." } }));
    try {
      const response = await fetch(`${API_BASE}/api/ai/provider/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ provider, model, temperature: config.temperature })
      });
      const json = await response.json() as { ok?: boolean; provider?: string; model?: string; keySource?: string; error?: string };
      if (!response.ok || !json.ok) throw new Error(json.error || "连通性测试失败");
      setTestResults((current) => ({ ...current, [provider.id]: { ok: true, message: `连接成功：${json.provider} / ${json.model}，密钥来源 ${json.keySource === "frontend" ? "前端配置" : "后端环境变量"}` } }));
    } catch (error) {
      setTestResults((current) => ({ ...current, [provider.id]: { ok: false, message: getErrorMessage(error) } }));
    } finally {
      setTestingProviderId("");
    }
  };
  return (
    <div className="ai-config">
      <div className="security-note">
        <b>配置原则</b>
        <span>可以在这里粘贴 API Key，界面会用密码框隐藏，并由后端代理调用。对外商用版本建议改为后端加密存储或密钥管理服务，前端只做录入和测试。</span>
      </div>
      <div className="ai-section">
        <div className="section-title-row">
          <h3>模型供应商</h3>
          <button className="secondary-button" onClick={addProvider}>新增供应商</button>
        </div>
        <div className="provider-grid">
          {config.providers.map((provider) => (
            <article className="provider-card" key={provider.id}>
              <label className="check-line"><input checked={provider.enabled} type="checkbox" onChange={(event) => updateProvider(provider.id, { enabled: event.target.checked })} />启用</label>
              <label>供应商名称<input value={provider.name} onChange={(event) => updateProvider(provider.id, { name: event.target.value })} /></label>
              <label>接口类型<input value={provider.type} onChange={(event) => updateProvider(provider.id, { type: event.target.value })} /></label>
              <label>Base URL<input value={provider.baseUrl} onChange={(event) => updateProvider(provider.id, { baseUrl: event.target.value })} /></label>
              <label>密钥引用名<input value={provider.apiKeyRef} onChange={(event) => updateProvider(provider.id, { apiKeyRef: event.target.value })} /></label>
              <label>API Key<input autoComplete="off" placeholder="粘贴后自动隐藏；为空时使用后端环境变量" type="password" value={provider.apiKey || ""} onChange={(event) => updateProvider(provider.id, { apiKey: event.target.value })} /></label>
              <button className="secondary-button" disabled={testingProviderId === provider.id} onClick={() => testProvider(provider)}>
                {testingProviderId === provider.id ? "测试中..." : "测试连通性"}
              </button>
              {testResults[provider.id] && <small className={testResults[provider.id].ok ? "provider-test ok" : "provider-test error"}>{testResults[provider.id].message}</small>}
            </article>
          ))}
        </div>
      </div>
      <div className="ai-section">
        <h3>任务模型分配</h3>
        <div className="task-model-grid">
          {(Object.keys(aiTaskLabels) as AiTaskKey[]).map((taskKey) => (
            <article className="task-model-card" key={taskKey}>
              <b>{aiTaskLabels[taskKey]}</b>
              <span className="model-mode-pill">{modelModeLabel(config.taskModels[taskKey].model)}</span>
              <label>供应商<select value={config.taskModels[taskKey].providerId} onChange={(event) => updateTaskModel(taskKey, { providerId: event.target.value })}>{config.providers.map((provider) => <option key={provider.id} value={provider.id}>{provider.name}</option>)}</select></label>
              <label>模型名<input value={config.taskModels[taskKey].model} onChange={(event) => updateTaskModel(taskKey, { model: event.target.value })} /></label>
            </article>
          ))}
        </div>
      </div>
      <div className="ai-section">
        <h3>调用策略</h3>
        <div className="strategy-grid">
          <label>策略模式<select value={config.strategy} onChange={(event) => onChange({ ...config, strategy: event.target.value })}>{["快速模式", "标准模式", "深度模式", "保守模式", "成本优先", "准确性优先", "私有安全优先"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>不确定性处理<select value={config.uncertaintyPolicy} onChange={(event) => onChange({ ...config, uncertaintyPolicy: event.target.value })}>{["不确定即标注疑问", "低置信度标注疑问", "允许给出假设并标注", "只输出已确认结论"].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label>最大推理轮次<input min={1} max={8} type="number" value={config.maxRounds} onChange={(event) => onChange({ ...config, maxRounds: Number(event.target.value) })} /></label>
          <label>Temperature<input min={0} max={1} step={0.1} type="number" value={config.temperature} onChange={(event) => onChange({ ...config, temperature: Number(event.target.value) })} /></label>
        </div>
      </div>
    </div>
  );
}

function AiRunningCard({ config, taskKey, text }: { config: AiConfig; taskKey: AiTaskKey; text: string }) {
  const { provider, model } = getTaskModel(config, taskKey);
  return (
    <div className="thinking ai-running">
      <b>{text}</b>
      <span>当前任务：{aiTaskLabels[taskKey]}</span>
      <span>使用模型：{provider?.name || "未配置"} / {model}</span>
      <span>调用策略：{config.strategy} · {config.uncertaintyPolicy} · 最多 {config.maxRounds} 轮</span>
    </div>
  );
}

function ModelRecommendations({ plans, onChange }: { plans: ModelPlan[]; onChange: (id: string, patch: Partial<ModelPlan>) => void }) {
  return (
    <div className="model-plan-list">
      <div className="single-select-note">
        <b>目标模型只能选择一个</b>
        <span>这里确定最终目标表名。DIM / DWD / DWS 只是不同建模方案建议，最终交付 DDL 和字段映射会使用你单选的这一个目标模型。</span>
      </div>
      {plans.map((plan) => (
        <article className={plan.selected ? "model-plan-card accepted" : "model-plan-card"} key={plan.id}>
          <div className="model-plan-top">
            <label className="check-line">
              <input checked={plan.selected} name="target-model-plan" type="radio" onChange={() => onChange(plan.id, { selected: true })} />
              选择为目标模型
            </label>
            <span>{plan.recommendation} 推荐</span>
          </div>
          <div className="model-plan-grid">
            <label>模型表名<input value={plan.tableName} onChange={(event) => onChange(plan.id, { tableName: event.target.value })} /></label>
            <label>中文名<input value={plan.cnName} onChange={(event) => onChange(plan.id, { cnName: event.target.value })} /></label>
            <label>分层<select value={plan.layer} onChange={(event) => onChange(plan.id, { layer: event.target.value })}>{["DIM", "DWD", "DWS", "ADS", "待判断"].map((layer) => <option key={layer}>{layer}</option>)}</select></label>
            <label>模型类型<input value={plan.modelType} onChange={(event) => onChange(plan.id, { modelType: event.target.value })} /></label>
            <label className="wide-label">粒度<input value={plan.grain} onChange={(event) => onChange(plan.id, { grain: event.target.value })} /></label>
          </div>
        </article>
      ))}
    </div>
  );
}

function MappingTable({ mappings }: { mappings: Mapping[] }) {
  return <DataTable headers={["目标字段", "建议英文名", "类型", "来源表", "来源字段", "取值逻辑", "可行性", "状态"]} rows={mappings.map((item) => [item.cn, item.en, item.kind, item.sourceTable, item.sourceField, item.logic, item.feasibility, item.status])} />;
}

function QuestionTable({ questions, onChange, disabled }: { questions: Question[]; onChange: (id: string, patch: Partial<Question>) => void; disabled: boolean }) {
  return (
    <div className="question-list">
      {questions.map((question) => (
        <article className="question-card" key={question.id}>
          <div className="question-meta">
            <b>{question.id} · {question.type}</b>
            <span>负责人：{question.owner}</span>
          </div>
          <h3>{question.desc}</h3>
          <p>AI 建议：{question.suggestion}</p>
          <div className="question-edit-grid">
            <label>
              业务/开发补充口径
              <textarea
                disabled={disabled}
                placeholder="例如：完成时间取事件表中 event_type=完成且结果有效的最早时间；客户/组织类维度当前值和业务发生时值都保留。"
                value={question.answer || ""}
                onChange={(event) => onChange(question.id, { answer: event.target.value })}
              />
            </label>
            <label>
              处理状态
              <select disabled={disabled} value={question.status} onChange={(event) => onChange(question.id, { status: event.target.value })}>
                {["待确认", "已确认", "待补表", "待补字典", "二期处理", "不纳入本期", "已解决"].map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReanalysisProgress({ activeStep, config }: { activeStep: number; config: AiConfig }) {
  const { provider, model } = getTaskModel(config, "mapping");
  const steps = [
    "读取疑问中心补充口径",
    "重新判断字段来源和可行性",
    "复核粒度、字典和当前/历史口径",
    "更新字段映射状态与取值逻辑",
    "返回字段映射工作台"
  ];
  return (
    <div className="llm-progress">
      <div>
        <b>大模型正在重新判断映射合理性</b>
        <span>本次会结合你在疑问中心补充的口径，重新评估字段映射、可行性、置信度和待补项。</span>
        <span>使用模型：{provider?.name || "未配置"} / {model} · {config.strategy}</span>
      </div>
      <ol>
        {steps.map((step, index) => (
          <li className={index < activeStep ? "done" : index === activeStep ? "active" : ""} key={step}>
            <span>{index + 1}</span>{step}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Deliverables({ taskName, targets, mappings, tables, questions, modelPlans, generatedSql, generatedPrd, aiStatus }: { taskName: string; targets: TargetField[]; mappings: Mapping[]; tables: SourceTable[]; questions: Question[]; modelPlans: ModelPlan[]; generatedSql: string; generatedPrd: string; aiStatus: AiStatus }) {
  const deliveryModel = modelPlans.find((plan) => plan.selected) || modelPlans[0];
  const candidateModels = modelPlans;
  if (!deliveryModel || !generatedSql || !generatedPrd) {
    return (
      <div className="deliverables">
        <AiErrorCard message="交付物必须由大模型成功生成后才允许预览和下载。当前没有可用的大模型 SQL/PRD 结果。" />
      </div>
    );
  }
  const ddl = buildDdl(deliveryModel, targets);
  const sql = generatedSql;
  const prd = generatedPrd;
  const enumRows = buildEnumRows(tables, mappings);
  return (
    <div className="deliverables">
      <div className="export-panel">
        <h3>可导出对象</h3>
        <button className="export-chip" onClick={() => exportExcel(taskName, targets, mappings, tables, questions, candidateModels, deliveryModel, ddl, sql)}>Excel 字段口径表</button>
        <button className="export-chip" onClick={() => downloadText(`${safeFileName(taskName)}_PRD.md`, prd, "text/markdown;charset=utf-8")}>PRD 文档</button>
        <button className="export-chip" onClick={() => downloadText(`${safeFileName(taskName)}_DDL.sql`, ddl, "text/sql;charset=utf-8")}>DDL</button>
        <button className="export-chip" onClick={() => downloadText(`${safeFileName(taskName)}_SQL草稿.sql`, sql, "text/sql;charset=utf-8")}>SQL 草稿</button>
        <button className="export-chip" onClick={() => downloadCsv(`${safeFileName(taskName)}_疑问清单.csv`, questions)}>疑问清单</button>
        <button className="export-chip" onClick={() => downloadCsv(`${safeFileName(taskName)}_枚举字典.csv`, enumRows)}>枚举字典</button>
      </div>
      <div className="delivery-summary">
        <b>当前交付主模型：{deliveryModel.tableName}</b>
        <span>{deliveryModel.cnName} · {deliveryModel.layer} · {deliveryModel.modelType} · {deliveryModel.grain}</span>
        <span>交付物已由大模型生成，可继续人工复核后下载。</span>
        {aiStatus.mode !== "idle" && <small>{aiStatus.message}</small>}
      </div>
      <pre>{ddl}</pre>
      <pre>{sql}</pre>
      <pre>{prd}</pre>
      <p>交付摘要：{tables.length} 张来源表、{targets.length} 个目标字段、{questions.length} 个疑问项，字段映射已生成 {mappings.length} 条。</p>
    </div>
  );
}

function buildDdl(deliveryModel: ModelPlan, targets: TargetField[]) {
  return `CREATE TABLE ${deliveryModel.tableName} (\n${targets.map((field) => `  ${field.en} varchar(255) COMMENT '${field.cn}'`).join(",\n")}\n) COMMENT='${deliveryModel.cnName}';`;
}

function buildEnumRows(tables: SourceTable[], mappings: Mapping[]) {
  const fromTables = tables.flatMap((table) =>
    table.fields
      .filter((field) => field.enumText || /状态|结果|是否|渠道|原因/.test(field.comment + field.name))
      .map((field) => ({
        来源表: table.name,
        来源字段: field.name,
        字段注释: field.comment,
        枚举值说明: field.enumText || "待补充",
        来源: field.enumText ? "字段注释/模板" : "AI 识别",
        是否确认: field.enumText ? "否" : "否",
        备注: field.enumText ? "" : "建议补充公共字典或业务枚举"
      }))
  );
  const fromMappings = mappings
    .filter((item) => item.feasibility.includes("字典"))
    .map((item) => ({
      来源表: item.sourceTable,
      来源字段: item.sourceField,
      字段注释: item.cn,
      枚举值说明: "待补充",
      来源: "字段映射风险",
      是否确认: "否",
      备注: item.logic
    }));
  return [...fromTables, ...fromMappings];
}

function exportExcel(taskName: string, targets: TargetField[], mappings: Mapping[], tables: SourceTable[], questions: Question[], modelPlans: ModelPlan[], deliveryModel: ModelPlan, ddl: string, sql: string) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ 模型名称: taskName, 交付主模型: deliveryModel.tableName, 主模型中文名: deliveryModel.cnName, 来源表数量: tables.length, 目标字段数量: targets.length, 待确认问题数: questions.length, 推荐层级: deliveryModel.layer, 模型粒度: deliveryModel.grain }]), "模型总览");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(modelPlans.map((plan) => ({ 是否目标模型: plan.selected ? "是" : "否", 模型表名: plan.tableName, 中文名: plan.cnName, 分层: plan.layer, 模型类型: plan.modelType, 粒度: plan.grain, 推荐程度: plan.recommendation }))), "目标模型方案");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(targets.map((item) => ({ 中文字段名: item.cn, 建议英文名: item.en, 字段类型: item.kind, 优先级: item.priority }))), "字段横版");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(mappings.map((item) => ({ 目标字段: item.cn, 建议英文名: item.en, 字段类型: item.kind, 推荐来源表: item.sourceTable, 推荐来源字段: item.sourceField, 取值逻辑: item.logic, 可行性: item.feasibility, 置信度: item.confidence, 状态: item.status }))), "字段映射关系");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(tables.flatMap((table) => table.fields.map((field) => ({ 表名: table.name, 表注释: table.comment, 字段名: field.name, 字段注释: field.comment, 数据类型: field.type, 是否主键: field.primary ? "是" : "否", 是否可空: field.nullable || "", 默认值: field.defaultValue || "", 枚举说明: field.enumText || "", 疑似字段类型: field.semantic })))), "来源表清单");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(buildEnumRows(tables, mappings)), "枚举字典");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(questions.map((item) => ({ 疑问编号: item.id, 疑问类型: item.type, 问题描述: item.desc, AI建议: item.suggestion, 负责人: item.owner, 状态: item.status }))), "疑问点清单");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["DDL"], [ddl], [], ["SQL 草稿"], [sql]]), "SQL草稿");
  const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  downloadBlob(data, `${safeFileName(taskName)}_字段口径交付物.xlsx`, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

function downloadCsv(filename: string, rows: Array<Record<string, string>>) {
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => escapeCsv(row[header] || "")).join(","))].join("\n");
  downloadText(filename, `\uFEFF${csv}`, "text/csv;charset=utf-8");
}

function escapeCsv(value: string) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function downloadText(filename: string, content: string, type: string) {
  downloadBlob(content, filename, type);
}

function downloadBlob(content: BlobPart, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_") || "模型交付物";
}

function DataTable({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return <div className="data-table-wrap"><table className="data-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div>;
}

export default App;
