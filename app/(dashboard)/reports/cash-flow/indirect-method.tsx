/**
 * 间接法现金流量表（CAS 31）
 *
 * 经营活动：从净利润出发，调整非现金项目和营运资本变动
 * 投资/筹资活动：直接复用直接法现金凭证分析
 */
import { db } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";
import type { CashFlowItem } from "./page";

// 按直接法分类的投资/筹资现金流，汇总后供间接法使用
function groupInvestFinance(items: CashFlowItem[]) {
  const groups: Record<"INVESTING" | "FINANCING", { inflows: number; outflows: number; items: CashFlowItem[] }> = {
    INVESTING: { inflows: 0, outflows: 0, items: [] },
    FINANCING: { inflows: 0, outflows: 0, items: [] },
  };
  for (const item of items) {
    if (item.activity === "INVESTING" || item.activity === "FINANCING") {
      const g = groups[item.activity];
      if (item.amount >= 0) g.inflows += item.amount;
      else g.outflows += item.amount;
      g.items.push(item);
    }
  }
  return groups;
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return parseFloat(d.toString());
}

interface Props {
  companyId: string;
  companyName: string;
  selectedPeriodName: string;
  selectedPeriodNumber: number;
  ytdPeriodIds: string[];      // 当年1..N期
  priorPeriodIds: string[];    // 当年之前所有期
  cashFlowItems: CashFlowItem[]; // 直接法数据（投资/筹资复用）
  openingBalance: number;
}

// 账户类别到账务代码映射（使用 code startsWith 匹配）
const AR_CODES     = ["1122", "1121", "1231", "1133"];  // 应收账款类
const INV_CODES    = ["1405", "1401", "1402", "1403", "1301", "1302", "1303", "1406"]; // 存货类
const AP_CODES     = ["2202", "2211", "2232"];            // 应付账款类
const TAX_CODES    = ["2221"];                            // 应交税费
const SALARY_CODES = ["2231", "2241"];                   // 应付薪酬/其他应付款

async function getAccountBalance(
  companyId: string,
  periodIds: string[],
  codePrefixes: string[],
  normalBalance: "DEBIT" | "CREDIT"
): Promise<number> {
  if (periodIds.length === 0) return 0;

  const agg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: {
        companyId,
        fiscalPeriodId: { in: periodIds },
        status: "POSTED",
      },
      account: {
        OR: codePrefixes.map((c) => ({ code: { startsWith: c } })),
      },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });

  const debit  = toNum(agg._sum.debitAmountLC);
  const credit = toNum(agg._sum.creditAmountLC);
  return normalBalance === "DEBIT" ? debit - credit : credit - debit;
}

export async function IndirectCashFlowReport({
  companyId,
  companyName,
  selectedPeriodName,
  selectedPeriodNumber,
  ytdPeriodIds,
  priorPeriodIds,
  cashFlowItems,
  openingBalance,
}: Props) {
  const fmt = (n: number, showSign = false) => {
    const abs = Math.abs(n);
    const formatted = new Intl.NumberFormat("zh-CN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs);
    if (n === 0) return "—";
    if (showSign && n > 0) return `+${formatted}`;
    return n < 0 ? `(${formatted})` : formatted;
  };

  // ── 净利润（YTD） ─────────────────────────────────────────────────────────
  const [revAgg, expAgg] = await Promise.all([
    db.journalEntryLine.aggregate({
      where: {
        journalEntry: { companyId, fiscalPeriodId: { in: ytdPeriodIds }, status: "POSTED" },
        account: { accountType: "REVENUE" },
      },
      _sum: { debitAmountLC: true, creditAmountLC: true },
    }),
    db.journalEntryLine.aggregate({
      where: {
        journalEntry: { companyId, fiscalPeriodId: { in: ytdPeriodIds }, status: "POSTED" },
        account: { accountType: "EXPENSE" },
      },
      _sum: { debitAmountLC: true, creditAmountLC: true },
    }),
  ]);
  const revenue  = toNum(revAgg._sum.creditAmountLC) - toNum(revAgg._sum.debitAmountLC);
  const expense  = toNum(expAgg._sum.debitAmountLC)  - toNum(expAgg._sum.creditAmountLC);
  const netProfit = revenue - expense;

  // ── 固定资产折旧（来自 DepreciationRecord） ───────────────────────────────
  const depAgg = await db.depreciationRecord.aggregate({
    where: { fiscalPeriodId: { in: ytdPeriodIds }, asset: { companyId } },
    _sum: { amount: true },
  });
  const depreciation = toNum(depAgg._sum.amount);

  // ── 财务费用（6603） ─────────────────────────────────────────────────────
  const finAgg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: { companyId, fiscalPeriodId: { in: ytdPeriodIds }, status: "POSTED" },
      account: { code: { startsWith: "6603" } },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });
  const financeExpense = toNum(finAgg._sum.debitAmountLC) - toNum(finAgg._sum.creditAmountLC);

  // ── 营运资本变动（YTD 净变动） ───────────────────────────────────────────
  // 应收账款增加 → 经营活动现金流减少（AR 是借方正常，余额增加 = 流出增加）
  const arChange  = await getAccountBalance(companyId, ytdPeriodIds, AR_CODES,     "DEBIT");
  // 存货增加 → 经营活动现金流减少
  const invChange = await getAccountBalance(companyId, ytdPeriodIds, INV_CODES,    "DEBIT");
  // 应付账款增加 → 经营活动现金流增加（AP 是贷方正常，余额增加 = 流入增加）
  const apChange  = await getAccountBalance(companyId, ytdPeriodIds, AP_CODES,     "CREDIT");
  // 应交税费增加
  const taxChange = await getAccountBalance(companyId, ytdPeriodIds, TAX_CODES,    "CREDIT");
  // 应付职工薪酬增加
  const salChange = await getAccountBalance(companyId, ytdPeriodIds, SALARY_CODES, "CREDIT");

  // 经营活动现金流净额（间接法）
  const operatingCashFlow =
    netProfit
    + depreciation
    + financeExpense
    - arChange    // AR 增加 → 减
    - invChange   // 存货增加 → 减
    + apChange    // AP 增加 → 加
    + taxChange   // 税费增加 → 加
    + salChange;  // 薪酬增加 → 加

  // ── 投资/筹资活动（直接法数据） ────────────────────────────────────────
  const ifGroups = groupInvestFinance(cashFlowItems);
  const investNet  = ifGroups.INVESTING.inflows + ifGroups.INVESTING.outflows;
  const financeNet = ifGroups.FINANCING.inflows + ifGroups.FINANCING.outflows;

  // ── 期末现金余额 ────────────────────────────────────────────────────────
  const netChange    = operatingCashFlow + investNet + financeNet;
  const closingBalance = openingBalance + netChange;

  // 行定义
  type Row = { label: string; amount: number | null; indent?: number; isBold?: boolean; isSeparator?: boolean; isSubtotal?: boolean };

  const rows: Row[] = [
    { label: "一、经营活动产生的现金流量（间接法）", amount: null, isBold: true },
    { label: "净利润", amount: netProfit, indent: 1 },
    { label: "加：固定资产折旧", amount: depreciation, indent: 1 },
    { label: "加：财务费用", amount: financeExpense, indent: 1 },
    { label: "加：应付账款增加", amount: apChange, indent: 1 },
    { label: "加：应交税费增加", amount: taxChange, indent: 1 },
    { label: "加：应付薪酬增加", amount: salChange, indent: 1 },
    { label: "减：应收账款增加", amount: -arChange, indent: 1 },
    { label: "减：存货增加", amount: -invChange, indent: 1 },
    { label: "经营活动产生的现金流量净额", amount: operatingCashFlow, isBold: true, isSubtotal: true },

    { label: "二、投资活动产生的现金流量", amount: null, isBold: true },
    ...ifGroups.INVESTING.items.map((item) => ({
      label: item.entryDescription || item.counterpartSummary,
      amount: item.amount,
      indent: 1,
    })),
    { label: "投资活动产生的现金流量净额", amount: investNet, isBold: true, isSubtotal: true },

    { label: "三、筹资活动产生的现金流量", amount: null, isBold: true },
    ...ifGroups.FINANCING.items.map((item) => ({
      label: item.entryDescription || item.counterpartSummary,
      amount: item.amount,
      indent: 1,
    })),
    { label: "筹资活动产生的现金流量净额", amount: financeNet, isBold: true, isSubtotal: true },

    { label: "四、现金及现金等价物净增加额", amount: netChange, isBold: true, isSubtotal: true },
    { label: "加：期初现金及现金等价物余额", amount: openingBalance, indent: 1 },
    { label: "五、期末现金及现金等价物余额", amount: closingBalance, isBold: true, isSubtotal: true },
  ];

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b bg-muted/30 flex justify-between items-center">
        <div>
          <h2 className="text-sm font-semibold">{companyName} — {selectedPeriodName}（间接法）</h2>
          <p className="text-xs text-muted-foreground mt-0.5">单位：元 | CAS 31 间接法</p>
        </div>
        <span className="text-xs bg-blue-100 text-blue-700 rounded px-2 py-0.5">间接法</span>
      </div>

      <table className="w-full text-sm">
        <thead className="bg-muted/20 border-b">
          <tr>
            <th className="px-4 py-2 text-left font-medium text-muted-foreground">项目</th>
            <th className="px-4 py-2 text-right font-medium text-muted-foreground">金额（元）</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className={
                row.isSubtotal
                  ? "bg-muted/20 border-t-2"
                  : row.isBold
                  ? "bg-muted/10"
                  : "hover:bg-muted/10"
              }
            >
              <td
                className={`px-4 py-2 ${row.isBold ? "font-semibold" : "text-muted-foreground"}`}
                style={{ paddingLeft: row.indent ? `${(row.indent + 1) * 16}px` : undefined }}
              >
                {row.label}
              </td>
              <td className={`px-4 py-2 text-right font-mono ${row.isSubtotal ? "font-semibold text-blue-600" : ""}`}>
                {row.amount === null
                  ? ""
                  : row.amount === 0
                  ? "—"
                  : fmt(row.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="px-4 py-3 border-t bg-muted/10 text-xs text-muted-foreground space-y-1">
        <p>※ 净利润根据 REVENUE 与 EXPENSE 科目 YTD 发生额计算，不含期间结转分录。</p>
        <p>※ 固定资产折旧取自折旧记录表（DepreciationRecord）YTD 合计，非凭证倒推。</p>
        <p>※ 营运资本变动为当年累计发生额；期初余额变动需参照直接法对比。</p>
        <p>※ 投资/筹资活动现金流量与直接法一致，均基于现金科目对方科目自动归类。</p>
      </div>
    </div>
  );
}
