/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import type { PromptName, PromptRequest } from "./types.js";

export function buildMockAiResult(promptName: PromptName, request: PromptRequest) {
  const sourceTables = request.sourceTables || [];
  const targetFields = request.targetFields || [];
  const selectedModel = request.selectedModel as { tableName?: string; grain?: string; layer?: string } | undefined;

  switch (promptName) {
    case "table_semantic":
      return {
        tables: sourceTables.map((table) => ({
          tableName: table.name,
          businessName: table.comment || table.name,
          tableType: inferTableType(table.name, table.comment),
          warehouseLayerGuess: "ODS来源表 / DWD候选",
          domainGuess: request.businessDomain || "通用业务域",
          grain: inferGrain(table.name, table.comment),
          confidence: "中高",
          evidence: [`识别 ${table.fields.length} 个字段`],
          risks: [],
          questions: []
        })),
        businessProcesses: [],
        globalRisks: ["当前为 mock AI 结果，接入真实模型后会输出更完整推理"],
        summary: "已完成表语义 mock 分析"
      };
    case "model_recommendation":
      return {
        candidateModels: [
          {
            id: "dws_wide",
            tableName: "dws_business_topic_wide",
            cnName: "业务主题宽表",
            layer: "DWS",
            modelType: "主题宽表",
            grain: selectedModel?.grain || "待确认主粒度",
            recommendation: "中高",
            reason: "根据目标字段推荐一个可复用 DWS 主题模型",
            risks: ["需要人工确认目标模型粒度"],
            requiredConfirmations: ["确认主粒度"]
          }
        ],
        preferredCandidateId: "dws_wide",
        questions: [],
        summary: "已生成 mock 模型推荐"
      };
    case "field_mapping":
      return {
        mappings: targetFields.map((field, index) => ({
          targetFieldName: getFieldName(field),
          sourceTable: sourceTables[0]?.name || null,
          sourceField: sourceTables[0]?.fields[index % Math.max(sourceTables[0]?.fields.length || 1, 1)]?.name || null,
          logic: "mock：根据字段语义推荐来源，需人工复核",
          feasibility: "需业务确认",
          confidence: "中",
          status: "待确认",
          risks: []
        })),
        missingFields: [],
        summary: "已生成 mock 字段映射"
      };
    case "question_review":
      return {
        updatedMappings: request.mappings || [],
        resolvedQuestions: [],
        remainingQuestions: request.questions || [],
        reviewSummary: "mock：已读取疑问补充，真实模型接入后会重新推理映射"
      };
    case "sql_generation":
      return {
        targetTable: selectedModel?.tableName || "dws_target_table",
        sql: `-- mock SQL\nselect * from ${sourceTables[0]?.name || "ods_source_table"};`,
        assumptions: ["当前为 mock SQL"],
        warnings: ["请接入真实模型并由开发复核"],
        qualityCheckSql: []
      };
    case "prd_generation":
      return {
        markdown: `# ${selectedModel?.tableName || "目标模型"}\n\nmock PRD，真实模型接入后生成完整文档。`,
        excelSheets: [],
        deliveryChecklist: ["确认目标模型主粒度"],
        warnings: []
      };
    case "field_semantic":
    default:
      return {
        sourceFieldSemantics: sourceTables.flatMap((table) =>
          table.fields.map((field) => ({
            tableName: table.name,
            fieldName: field.name,
            businessName: field.comment || field.name,
            semanticTypes: [field.comment?.includes("时间") ? "时间字段" : "业务属性字段"],
            confidence: "中"
          }))
        ),
        targetFieldSemantics: [],
        summary: "已完成 mock 字段语义分析"
      };
  }
}

function inferTableType(name: string, comment = "") {
  const text = `${name} ${comment}`;
  if (/dict|字典/i.test(text)) return "字典表";
  if (/event|record|process|事件|流程|记录/i.test(text)) return "事件/流程记录表";
  if (/customer|product|employee|org|supplier|客户|商品|员工|组织|供应商/i.test(text)) return "业务对象表";
  return "业务活动表";
}

function inferGrain(name: string, comment = "") {
  if (/snapshot|快照/i.test(`${name} ${comment}`)) return "一个快照周期一行";
  if (/event|record|事件|记录/i.test(`${name} ${comment}`)) return "一个事件/记录一行";
  return "一条业务活动/单据一行";
}

function getFieldName(field: unknown) {
  if (field && typeof field === "object" && "cn" in field) return String((field as { cn: unknown }).cn);
  if (field && typeof field === "object" && "name" in field) return String((field as { name: unknown }).name);
  return String(field);
}
