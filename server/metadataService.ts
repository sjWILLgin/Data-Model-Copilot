/*
 * Copyright (c) 2026 will（水金）. All rights reserved.
 * Proprietary and confidential.
 */

import type { DatabaseConfig, SourceTable } from "./types.js";

const mockOdsCatalog: SourceTable[] = [
  {
    name: "ods_sales_order",
    comment: "销售订单主表",
    fields: [
      { table: "ods_sales_order", name: "order_id", comment: "订单ID", type: "bigint", primary: true },
      { table: "ods_sales_order", name: "customer_id", comment: "客户ID", type: "bigint" },
      { table: "ods_sales_order", name: "order_time", comment: "下单时间", type: "datetime" },
      { table: "ods_sales_order", name: "order_amount", comment: "订单金额", type: "decimal(18,2)" },
      { table: "ods_sales_order", name: "order_status", comment: "订单状态 1待支付 2已支付 3已关闭", type: "tinyint" }
    ]
  },
  {
    name: "ods_inventory_snapshot",
    comment: "库存日快照表",
    fields: [
      { table: "ods_inventory_snapshot", name: "stat_date", comment: "统计日期", type: "date" },
      { table: "ods_inventory_snapshot", name: "warehouse_id", comment: "仓库ID", type: "bigint" },
      { table: "ods_inventory_snapshot", name: "sku_id", comment: "SKU ID", type: "bigint" },
      { table: "ods_inventory_snapshot", name: "stock_qty", comment: "库存数量", type: "decimal(18,4)" }
    ]
  },
  {
    name: "ods_finance_expense",
    comment: "费用报销单表",
    fields: [
      { table: "ods_finance_expense", name: "expense_id", comment: "报销单ID", type: "bigint", primary: true },
      { table: "ods_finance_expense", name: "cost_center_id", comment: "成本中心ID", type: "bigint" },
      { table: "ods_finance_expense", name: "expense_amount", comment: "报销金额", type: "decimal(18,2)" },
      { table: "ods_finance_expense", name: "accounting_period", comment: "会计期间", type: "varchar(16)" }
    ]
  }
];

export async function testMetadataConnection(config: DatabaseConfig) {
  return {
    ok: true,
    mode: "mock",
    message: "当前为元数据连接 mock。生产环境请在此处接入 Hive/MaxCompute/Hologres/StarRocks 元数据查询。",
    safeConfig: maskDatabaseConfig(config)
  };
}

export async function listOdsTables(config?: DatabaseConfig, keyword = "") {
  const pattern = config?.odsPattern?.replace("*", "") || "ods_";
  return mockOdsCatalog.filter((table) => {
    const matchesPattern = table.name.includes(pattern.replace("_", "")) || table.name.startsWith(pattern);
    const matchesKeyword = !keyword || `${table.name} ${table.comment}`.toLowerCase().includes(keyword.toLowerCase());
    return matchesPattern && matchesKeyword;
  });
}

export function maskDatabaseConfig(config: DatabaseConfig) {
  return {
    ...config,
    username: config.username ? `${config.username.slice(0, 2)}***` : "",
    passwordRef: config.passwordRef || ""
  };
}
