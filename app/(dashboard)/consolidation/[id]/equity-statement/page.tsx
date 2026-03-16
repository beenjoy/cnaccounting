/**
 * 合并所有者权益变动表（CAS 30 / CAS 33）
 *
 * 展示集团整体权益科目的期初→期末变动，分拆：
 *   - 归属母公司股东权益（按实收资本、资本公积、盈余公积、未分配利润细分）
 *   - 少数股东权益（NCI）
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/ui/print-button";
import {
  loadGroupInfo,
  computeNCIAndElimination,
  type ConsolidationMemberInfo,
} from "@/lib/consolidation-utils";

interface SearchParams { year?: string; month?: string; }

// ── 权益科目分类 ───────────────────────────────────────────────────────────────
type EquityCategory = "paid_in" | "capital_reserve" | "surplus_reserve" | "retained" | "other";

function categorizeEquityAccount(code: string, name: string): EquityCategory {
  if (code.startsWith("4001") || name.includes("实收资本") || name.includes("股本")) return "paid_in";
  if (code.startsWith("4002") || name.includes("资本公积")) return "capital_reserve";
  if (code.startsWith("4101") || name.includes("盈余公积")) return "surplus_reserve";
  // 4103 本年利润 & 4104 利润分配 → 未分配利润
  if (code.startsWith("41") || code.startsWith("4103") || code.startsWith("4104") || name.includes("利润") || name.includes("分配")) return "retained";
  return "other";
}

const CATEGORY_LABELS: Record<EquityCategory, string> = {
  paid_in:          "实收资本",
  capital_reserve:  "资本公积",
  surplus_reserve:  "盈余公积",
  retained:         "未分配利润",
  other:            "其他权益",
};

type EquityCols = Record<EquityCategory, number>;

const ZERO_COLS = (): EquityCols => ({
  paid_in: 0, capital_reserve: 0, surplus_reserve: 0, retained: 0, other: 0,
});

function colSum(cols: EquityCols): number {
  return Object.values(cols).reduce((s, v) => s + v, 0);
}

// ── 计算特定期间集合下的权益余额（贷方正常余额） ────────────────────────────
async function computeEquityByCategory(
  companyIds: string[],
  periodIds: string[]
): Promise<EquityCols> {
  if (periodIds.length === 0 || companyIds.length === 0) return ZERO_COLS();

  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        companyId: { in: companyIds },
        fiscalPeriodId: { in: periodIds },
        status: "POSTED",
      },
      account: { accountType: "EQUITY" },
    },
    select: {
      debitAmountLC: true,
      creditAmountLC: true,
      account: { select: { code: true, name: true } },
    },
  });

  const result = ZERO_COLS();
  for (const line of lines) {
    const cat = categorizeEquityAccount(line.account.code, line.account.name);
    const debit = parseFloat((line.debitAmountLC ?? 0).toString());
    const credit = parseFloat((line.creditAmountLC ?? 0).toString());
    result[cat] += (credit - debit); // 贷方正常余额
  }
  return result;
}

// ── 计算特定公司特定期间集合下的净利润 ─────────────────────────────────────
async function computeNetProfit(companyIds: string[], periodIds: string[]): Promise<number> {
  if (periodIds.length === 0 || companyIds.length === 0) return 0;

  const agg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: {
        companyId: { in: companyIds },
        fiscalPeriodId: { in: periodIds },
        status: "POSTED",
      },
      account: { accountType: { in: ["REVENUE", "EXPENSE"] } },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });

  // 查分开的revenue/expense
  const revAgg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: {
        companyId: { in: companyIds },
        fiscalPeriodId: { in: periodIds },
        status: "POSTED",
      },
      account: { accountType: "REVENUE" },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });
  const expAgg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: {
        companyId: { in: companyIds },
        fiscalPeriodId: { in: periodIds },
        status: "POSTED",
      },
      account: { accountType: "EXPENSE" },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });

  void agg; // suppress unused warning

  const revenue = parseFloat((revAgg._sum.creditAmountLC ?? 0).toString())
                - parseFloat((revAgg._sum.debitAmountLC ?? 0).toString());
  const expense = parseFloat((expAgg._sum.debitAmountLC ?? 0).toString())
                - parseFloat((expAgg._sum.creditAmountLC ?? 0).toString());
  return revenue - expense;
}

export default async function ConsolidatedEquityStatementPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: groupId } = await params;
  const sp = await searchParams;

  const group = await loadGroupInfo(groupId);
  if (!group) notFound();

  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId: group.organization.id, userId: session.user.id },
  });
  if (!orgMember) redirect("/dashboard");

  const now = new Date();
  const year  = parseInt(sp.year  ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));

  const members: ConsolidationMemberInfo[] = group.members.map((m) => ({
    id:                    m.id,
    companyId:             m.companyId,
    companyName:           m.company.name,
    memberType:            m.memberType,
    ownershipPct:          Number(m.ownershipPct),
    consolidationMethod:   m.consolidationMethod,
    investmentAccountCode: m.investmentAccountCode,
  }));

  const fullMembers = members.filter(
    (m) => m.consolidationMethod === "FULL" || m.memberType === "PARENT"
  );
  const companyIds = fullMembers.map((m) => m.companyId);

  // ── 期间 ID 查询 ──────────────────────────────────────────────────────────

  // 期初：全部历史期间（year 之前所有年度）
  const priorPeriods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId: { in: companyIds }, year: { lt: year } },
    },
    select: { id: true },
  });

  // 本期：当年 1 月到 reportingMonth
  const currentPeriods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId: { in: companyIds }, year },
      periodNumber: { lte: month },
    },
    select: { id: true },
  });

  const priorIds   = priorPeriods.map((p) => p.id);
  const currentIds = currentPeriods.map((p) => p.id);
  const allIds     = [...priorIds, ...currentIds];

  // ── 权益余额计算 ────────────────────────────────────────────────────────────

  // 期初余额 = 历史所有期间权益合计
  const openingCols = await computeEquityByCategory(companyIds, priorIds);

  // 当期权益变动 = 当年1至month的权益科目发生额
  const currentChangeCols = await computeEquityByCategory(companyIds, currentIds);

  // 期末余额 = 期初 + 当期变动
  const closingCols = ZERO_COLS();
  for (const cat of Object.keys(openingCols) as EquityCategory[]) {
    closingCols[cat] = openingCols[cat] + currentChangeCols[cat];
  }

  // 本期净利润（来自REVENUE-EXPENSE，影响未分配利润列）
  const netProfit = await computeNetProfit(companyIds, currentIds);

  // 其他权益变动 = 当期变动 - 净利润（仅影响retained列）
  const otherChangeCols = ZERO_COLS();
  for (const cat of Object.keys(currentChangeCols) as EquityCategory[]) {
    otherChangeCols[cat] = currentChangeCols[cat] - (cat === "retained" ? netProfit : 0);
  }

  // ── NCI 计算（CAS 33） ─────────────────────────────────────────────────────
  const hasMultiple = fullMembers.length > 1;
  let nciOpening = 0, nciNetProfit = 0, nciOtherChange = 0, nciClosing = 0;

  if (hasMultiple) {
    const [nciOpen, nciClose] = await Promise.all([
      computeNCIAndElimination(fullMembers, year - 1, 12).catch(() => null),
      computeNCIAndElimination(fullMembers, year, month),
    ]);
    const nciClosingData = nciClose;
    nciOpening    = nciOpen?.nciEquityTotal ?? 0;
    nciNetProfit  = nciClosingData.nciProfitYtd;
    nciClosing    = nciClosingData.nciEquityTotal;
    nciOtherChange = nciClosing - nciOpening - nciNetProfit;
  }

  // ── 可选年月列表 ─────────────────────────────────────────────────────────────
  const availableYears = await db.fiscalYear.findMany({
    where: { companyId: { in: companyIds } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
  const CATEGORIES = (["paid_in", "capital_reserve", "surplus_reserve", "retained", "other"] as EquityCategory[]).filter(
    (cat) => cat !== "other" || openingCols.other !== 0 || currentChangeCols.other !== 0
  );

  type RowDef = {
    label: string;
    data: EquityCols;
    nci: number;
    isBold?: boolean;
    isSubRow?: boolean;
  };

  const rows: RowDef[] = [
    { label: "年初余额",           data: openingCols,       nci: nciOpening,    isBold: true },
    { label: "本期变动金额",       data: currentChangeCols, nci: nciNetProfit + nciOtherChange },
    { label: "  其中：净利润",     data: { ...ZERO_COLS(), retained: netProfit }, nci: nciNetProfit,    isSubRow: true },
    { label: "  其他权益变动",     data: otherChangeCols,   nci: nciOtherChange,  isSubRow: true },
    { label: "年末余额",           data: closingCols,       nci: nciClosing,    isBold: true },
  ];

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* 面包屑 + 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1 text-sm text-muted-foreground">
            <Link href="/consolidation" className="hover:text-foreground">合并报表</Link>
            <span>/</span>
            <Link href={`/consolidation/${groupId}`} className="hover:text-foreground">{group.name}</Link>
            <span>/</span>
            <span className="text-foreground">所有者权益变动表</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">合并所有者权益变动表</h1>
          <p className="text-sm text-muted-foreground mt-0.5">依据 CAS 30 / CAS 33 编制</p>
        </div>
        <div className="flex items-center gap-2">
          <PrintButton />
          <Link
            href={`/consolidation/${groupId}`}
            className="text-sm text-primary hover:underline"
          >
            ← 返回集团
          </Link>
        </div>
      </div>

      {/* 期间选择器 */}
      <form method="GET" className="flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4 no-print">
        <div>
          <label className="block text-xs font-medium mb-1">年度</label>
          <select name="year" defaultValue={String(year)} className="rounded-md border px-3 py-1.5 text-sm">
            {availableYears.map((y) => (
              <option key={y.year} value={String(y.year)}>{y.year}年</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">截至月份</label>
          <select name="month" defaultValue={String(month)} className="rounded-md border px-3 py-1.5 text-sm">
            {MONTHS.map((m) => (
              <option key={m} value={String(m)}>{m}月</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">
          查询
        </button>
      </form>

      {/* 表格 */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h2 className="text-sm font-semibold">
            {group.name} — {year}年1月至{month}月合并所有者权益变动表
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">单位：元</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground min-w-40">项目</th>
                {CATEGORIES.map((cat) => (
                  <th key={cat} className="px-4 py-2 text-right font-medium text-muted-foreground min-w-32">
                    {CATEGORY_LABELS[cat]}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium text-muted-foreground min-w-32">
                  归属母公司<br className="hidden sm:block" />合计
                </th>
                {hasMultiple && (
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground min-w-32">
                    少数股东权益
                  </th>
                )}
                <th className="px-4 py-2 text-right font-medium text-muted-foreground min-w-32">
                  所有者权益合计
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, idx) => {
                const parentTotal = colSum(row.data);
                const grandTotal = parentTotal + row.nci;
                return (
                  <tr
                    key={idx}
                    className={
                      row.isBold
                        ? "bg-muted/20 font-semibold"
                        : row.isSubRow
                        ? "text-muted-foreground"
                        : ""
                    }
                  >
                    <td className="px-4 py-2 whitespace-nowrap">{row.label}</td>
                    {CATEGORIES.map((cat) => (
                      <td key={cat} className="px-4 py-2 text-right font-mono">
                        {row.data[cat] === 0 ? "—" : fmt(row.data[cat])}
                      </td>
                    ))}
                    <td className="px-4 py-2 text-right font-mono font-medium">
                      {parentTotal === 0 ? "—" : fmt(parentTotal)}
                    </td>
                    {hasMultiple && (
                      <td className="px-4 py-2 text-right font-mono">
                        {row.nci === 0 ? "—" : fmt(row.nci)}
                      </td>
                    )}
                    <td className="px-4 py-2 text-right font-mono font-medium text-blue-600">
                      {grandTotal === 0 ? "—" : fmt(grandTotal)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* 说明 */}
        <div className="px-4 py-3 border-t bg-muted/10 text-xs text-muted-foreground space-y-1">
          <p>※ 期初余额为本年度开始前所有历史期间权益科目累计余额（贷方正常余额）。</p>
          <p>※ 净利润根据当期 REVENUE 与 EXPENSE 科目发生额计算，未经结转至权益科目。</p>
          {hasMultiple && <p>※ 少数股东权益按 CAS 33 要求，以子公司净资产 × (1 - 持股比例) 计算。</p>}
        </div>
      </div>
    </div>
  );
}
