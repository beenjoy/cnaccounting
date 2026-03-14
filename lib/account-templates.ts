import { AccountTemplate } from "@prisma/client";

export interface AccountTemplateEntry {
  code: string;
  name: string;
  type: "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
  normal: "DEBIT" | "CREDIT";
  isLeaf: boolean;
  category:
    | "CURRENT_ASSET"
    | "NON_CURRENT_ASSET"
    | "CURRENT_LIABILITY"
    | "NON_CURRENT_LIABILITY"
    | "EQUITY_ITEM"
    | "OPERATING_REVENUE"
    | "OPERATING_COST"
    | "PERIOD_EXPENSE"
    | "NON_OPERATING_INCOME"
    | "NON_OPERATING_EXPENSE"
    | "INCOME_TAX";
}

// ============================================================
// 通用模板（21个核心科目）
// ============================================================
const GENERAL_ACCOUNTS: AccountTemplateEntry[] = [
  // 资产类 - 流动资产
  { code: "1001", name: "库存现金",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1002", name: "银行存款",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1122", name: "应收账款",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1405", name: "库存商品",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  // 资产类 - 非流动资产
  { code: "1601", name: "固定资产",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "NON_CURRENT_ASSET" },
  { code: "1602", name: "累计折旧",     type: "ASSET",     normal: "CREDIT", isLeaf: true, category: "NON_CURRENT_ASSET" },
  // 负债类 - 流动负债
  { code: "2202", name: "应付账款",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  { code: "2221", name: "应交税费",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  { code: "2241", name: "其他应付款",   type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  // 所有者权益
  { code: "4001", name: "实收资本",     type: "EQUITY",    normal: "CREDIT", isLeaf: true, category: "EQUITY_ITEM" },
  { code: "4002", name: "资本公积",     type: "EQUITY",    normal: "CREDIT", isLeaf: true, category: "EQUITY_ITEM" },
  { code: "4101", name: "盈余公积",     type: "EQUITY",    normal: "CREDIT", isLeaf: true, category: "EQUITY_ITEM" },
  { code: "4103", name: "本年利润",     type: "EQUITY",    normal: "CREDIT", isLeaf: true, category: "EQUITY_ITEM" },
  { code: "4104", name: "利润分配",     type: "EQUITY",    normal: "CREDIT", isLeaf: true, category: "EQUITY_ITEM" },
  // 收入类
  { code: "6001", name: "主营业务收入", type: "REVENUE",   normal: "CREDIT", isLeaf: true, category: "OPERATING_REVENUE" },
  { code: "6051", name: "其他业务收入", type: "REVENUE",   normal: "CREDIT", isLeaf: true, category: "OPERATING_REVENUE" },
  // 费用类
  { code: "6401", name: "主营业务成本", type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "OPERATING_COST" },
  { code: "6601", name: "销售费用",     type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "PERIOD_EXPENSE" },
  { code: "6602", name: "管理费用",     type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "PERIOD_EXPENSE" },
  { code: "6603", name: "财务费用",     type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "PERIOD_EXPENSE" },
  { code: "6711", name: "营业外支出",   type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "NON_OPERATING_EXPENSE" },
];

// ============================================================
// 制造业模板（通用 + 12个额外科目）
// ============================================================
const MANUFACTURING_EXTRA: AccountTemplateEntry[] = [
  // 资产类 - 流动资产（原材料、在途物资、发出商品）
  { code: "1211", name: "应收票据",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1301", name: "在途物资",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1302", name: "原材料",       type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1303", name: "材料成本差异", type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1321", name: "低值易耗品",   type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1401", name: "在产品",       type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1403", name: "产成品",       type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1406", name: "发出商品",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  // 生产成本科目
  { code: "5001", name: "生产成本",     type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "OPERATING_COST" },
  { code: "5101", name: "制造费用",     type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "OPERATING_COST" },
  // 负债
  { code: "2211", name: "应付票据",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  { code: "2231", name: "应付工资",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
];

// ============================================================
// 服务业模板（通用 + 6个额外科目）
// ============================================================
const SERVICE_EXTRA: AccountTemplateEntry[] = [
  // 合同相关（新收入准则）
  { code: "1231", name: "合同资产",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1232", name: "应收退货款",   type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "2261", name: "合同负债",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  { code: "2262", name: "预收款项",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  // 费用
  { code: "6404", name: "研发费用",     type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "PERIOD_EXPENSE" },
  // 营业外收入
  { code: "6301", name: "营业外收入",   type: "REVENUE",   normal: "CREDIT", isLeaf: true, category: "NON_OPERATING_INCOME" },
];

// ============================================================
// 商贸零售模板（通用 + 8个额外科目）
// ============================================================
const TRADE_EXTRA: AccountTemplateEntry[] = [
  // 资产
  { code: "1121", name: "应收票据",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1131", name: "预付账款",     type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1133", name: "其他应收款",   type: "ASSET",     normal: "DEBIT",  isLeaf: true, category: "CURRENT_ASSET" },
  { code: "1243", name: "买断式返售金融资产", type: "ASSET", normal: "DEBIT", isLeaf: true, category: "CURRENT_ASSET" },
  // 流动负债
  { code: "2211", name: "应付票据",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  { code: "2232", name: "预收账款",     type: "LIABILITY", normal: "CREDIT", isLeaf: true, category: "CURRENT_LIABILITY" },
  // 营业外收入
  { code: "6301", name: "营业外收入",   type: "REVENUE",   normal: "CREDIT", isLeaf: true, category: "NON_OPERATING_INCOME" },
  // 成本
  { code: "6402", name: "其他业务成本", type: "EXPENSE",   normal: "DEBIT",  isLeaf: true, category: "OPERATING_COST" },
];

// ============================================================
// 公共额外科目（所有非通用模板都包含）
// ============================================================
const COMMON_EXTRA: AccountTemplateEntry[] = [
  { code: "6301", name: "营业外收入",   type: "REVENUE",   normal: "CREDIT", isLeaf: true, category: "NON_OPERATING_INCOME" },
];

/**
 * 根据模板类型返回科目列表
 * 通用模板直接返回21个科目
 * 其他模板在通用科目基础上叠加额外科目（去重 code）
 */
export function getAccountTemplate(template: AccountTemplate): AccountTemplateEntry[] {
  const base = [...GENERAL_ACCOUNTS];

  let extra: AccountTemplateEntry[] = [];
  switch (template) {
    case "MANUFACTURING":
      extra = MANUFACTURING_EXTRA;
      break;
    case "SERVICE":
      extra = [...SERVICE_EXTRA];
      break;
    case "TRADE":
      extra = [...TRADE_EXTRA];
      break;
    case "GENERAL":
    default:
      // 通用模板增加营业外收入
      extra = [{ code: "6301", name: "营业外收入", type: "REVENUE", normal: "CREDIT", isLeaf: true, category: "NON_OPERATING_INCOME" }];
      break;
  }

  // 合并，code 不重复
  const existingCodes = new Set(base.map((a) => a.code));
  for (const acc of extra) {
    if (!existingCodes.has(acc.code)) {
      base.push(acc);
      existingCodes.add(acc.code);
    }
  }

  return base;
}

/** 返回模板的描述信息，用于 UI 展示 */
export const TEMPLATE_DESCRIPTIONS: Record<AccountTemplate, { label: string; description: string; accountCount: number }> = {
  GENERAL:       { label: "通用企业",   description: "适用于大多数服务型、贸易型企业，含22个核心科目", accountCount: 22 },
  MANUFACTURING: { label: "制造业",     description: "含通用科目 + 原材料、生产成本、制造费用等制造业专属科目", accountCount: 34 },
  SERVICE:       { label: "服务业",     description: "含通用科目 + 合同资产/负债、研发费用等服务业专属科目", accountCount: 28 },
  TRADE:         { label: "商贸零售",   description: "含通用科目 + 应收/应付票据、预付/预收款项等流通业科目", accountCount: 29 },
};
