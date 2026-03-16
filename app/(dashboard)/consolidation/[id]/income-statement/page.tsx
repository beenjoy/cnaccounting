import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/ui/print-button";
import {
  loadGroupInfo,
  computeConsolidatedPeriodBalances,
  computeConsolidatedBalances,
  computeNCIAndElimination,
  computeEquityMethodData,
  type ConsolidationMemberInfo,
} from "@/lib/consolidation-utils";

const CATEGORY_LABELS: Record<string, string> = {
  OPERATING_REVENUE:     "营业收入",
  OPERATING_COST:        "营业成本",
  PERIOD_EXPENSE:        "期间费用",
  NON_OPERATING_INCOME:  "营业外收入",
  NON_OPERATING_EXPENSE: "营业外支出",
  INCOME_TAX:            "所得税费用",
};

// Order for income statement display (revenue first, then costs/expenses)
const IS_ORDER = [
  "OPERATING_REVENUE",
  "OPERATING_COST",
  "PERIOD_EXPENSE",
  "NON_OPERATING_INCOME",
  "NON_OPERATING_EXPENSE",
  "INCOME_TAX",
];

interface SearchParams { year?: string; month?: string; }

export default async function ConsolidatedIncomeStatementPage({
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
  const year = parseInt(sp.year ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));

  const members: ConsolidationMemberInfo[] = group.members.map((m) => ({
    id: m.id,
    companyId: m.companyId,
    companyName: m.company.name,
    memberType: m.memberType,
    ownershipPct: Number(m.ownershipPct),
    consolidationMethod: m.consolidationMethod,
    investmentAccountCode: m.investmentAccountCode,
  }));

  const fullMembers = members.filter((m) => m.consolidationMethod === "FULL" || m.memberType === "PARENT");

  // Current period P&L
  const periodBalances = await computeConsolidatedPeriodBalances(fullMembers, year, month);
  // YTD P&L (cumulative from start of year)
  const ytdBalances = await computeConsolidatedBalances(fullMembers, year, month);

  // CAS 33: NCI profit attribution
  const hasMultipleMembers = fullMembers.length > 1;
  const nci = hasMultipleMembers
    ? await computeNCIAndElimination(fullMembers, year, month)
    : { nciProfitPeriod: 0, nciProfitYtd: 0, nciEquityTotal: 0,
        eliminatedAssets: 0, eliminatedEquity: 0, goodwillTotal: 0,
        hasInvestmentData: false, details: [] };

  // Filter to revenue/expense only
  const IS_TYPES = ["REVENUE", "EXPENSE"];
  const periodIS = periodBalances.filter((b) => IS_TYPES.includes(b.accountType));
  const ytdIS = ytdBalances.filter((b) => IS_TYPES.includes(b.accountType));

  // Group by reportCategory
  function groupByCategory(rows: typeof periodIS) {
    const map = new Map<string, { items: typeof rows; total: number }>();
    for (const b of rows) {
      const key = b.reportCategory ?? "__UNCATEGORIZED__";
      if (!map.has(key)) map.set(key, { items: [], total: 0 });
      map.get(key)!.items.push(b);
      map.get(key)!.total += b.balance;
    }
    return map;
  }

  const periodByCategory = groupByCategory(periodIS);
  const ytdByCategory = groupByCategory(ytdIS);

  // P&L calculations
  function calcMetrics(byCategory: ReturnType<typeof groupByCategory>) {
    const opRevenue = byCategory.get("OPERATING_REVENUE")?.total ?? 0;
    const opCost = byCategory.get("OPERATING_COST")?.total ?? 0;
    const periodExp = byCategory.get("PERIOD_EXPENSE")?.total ?? 0;
    const nonOpIncome = byCategory.get("NON_OPERATING_INCOME")?.total ?? 0;
    const nonOpExpense = byCategory.get("NON_OPERATING_EXPENSE")?.total ?? 0;
    const incomeTax = byCategory.get("INCOME_TAX")?.total ?? 0;

    const grossProfit = opRevenue - opCost;
    const operatingProfit = grossProfit - periodExp;
    const totalProfit = operatingProfit + nonOpIncome - nonOpExpense;
    const netProfit = totalProfit - incomeTax;

    return { opRevenue, opCost, periodExp, nonOpIncome, nonOpExpense, incomeTax, grossProfit, operatingProfit, totalProfit, netProfit };
  }

  const periodMetrics = calcMetrics(periodByCategory);
  const ytdMetrics = calcMetrics(ytdByCategory);

  // ── CAS 2：权益法投资收益 ──
  const equityItems = await computeEquityMethodData(members, year, month);
  const equityIncomePeriod = equityItems.reduce((s, e) => s + e.investmentIncomePeriod, 0);
  const equityIncomeYtd    = equityItems.reduce((s, e) => s + e.investmentIncomeYtd, 0);

  // 调整后利润（纳入权益法投资收益）
  const adjOpProfitPeriod    = periodMetrics.operatingProfit + equityIncomePeriod;
  const adjOpProfitYtd       = ytdMetrics.operatingProfit    + equityIncomeYtd;
  const adjTotalProfitPeriod = adjOpProfitPeriod + periodMetrics.nonOpIncome - periodMetrics.nonOpExpense;
  const adjTotalProfitYtd    = adjOpProfitYtd    + ytdMetrics.nonOpIncome    - ytdMetrics.nonOpExpense;
  const adjNetProfitPeriod   = adjTotalProfitPeriod - periodMetrics.incomeTax;
  const adjNetProfitYtd      = adjTotalProfitYtd    - ytdMetrics.incomeTax;

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const availableYears = await db.fiscalYear.findMany({
    where: { companyId: { in: fullMembers.map((m) => m.companyId) } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  }).then(rows => rows.map(r => r.year));

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

  const hasData = periodIS.length > 0 || ytdIS.length > 0;

  function Row({
    label,
    periodValue,
    ytdValue,
    isSubtotal = false,
    indent = false,
    isBold = false,
    isNegative = false,
  }: {
    label: string;
    periodValue: number;
    ytdValue: number;
    isSubtotal?: boolean;
    indent?: boolean;
    isBold?: boolean;
    isNegative?: boolean;
  }) {
    const cls = [
      "border-b",
      isSubtotal ? "bg-muted/20 font-semibold" : "hover:bg-muted/10",
    ].join(" ");
    const sign = isNegative ? -1 : 1;
    return (
      <tr className={cls}>
        <td className={`px-4 py-2 text-sm ${indent ? "pl-8" : ""} ${isBold ? "font-bold" : ""}`}>
          {label}
        </td>
        <td className={`px-4 py-2 text-right font-mono text-sm ${isBold ? "font-bold" : ""}`}>
          {fmt(sign * periodValue)}
        </td>
        <td className={`px-4 py-2 text-right font-mono text-sm text-muted-foreground ${isBold ? "font-bold" : ""}`}>
          {fmt(sign * ytdValue)}
        </td>
      </tr>
    );
  }

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/consolidation" className="text-sm text-muted-foreground hover:text-foreground">合并报表</Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/consolidation/${groupId}`} className="text-sm text-muted-foreground hover:text-foreground">{group.name}</Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">合并利润表</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">合并利润表</h1>
          <PrintButton />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {group.name} · {year}年{month}月 · 合并范围：{fullMembers.map(m => m.companyName).join("、")}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="no-print flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs font-medium mb-1">年度</label>
          <select name="year" defaultValue={year} className="rounded-md border px-3 py-1.5 text-sm">
            {availableYears.map(y => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">期间</label>
          <select name="month" defaultValue={month} className="rounded-md border px-3 py-1.5 text-sm">
            {MONTHS.map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">查询</button>
      </form>

      {fullMembers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          尚未添加成员公司，请先<Link href={`/consolidation/${groupId}`} className="text-primary hover:underline mx-1">配置合并组</Link>
        </div>
      ) : !hasData ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">所选期间暂无已过账收入/费用凭证</div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">项目</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">{year}年{month}月（本期）</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">{year}年1–{month}月（累计）</th>
              </tr>
            </thead>
            <tbody>
              {/* Operating Revenue */}
              <tr className="bg-muted/10 border-b">
                <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  营业收入及成本
                </td>
              </tr>
              <Row label="一、营业收入" periodValue={periodMetrics.opRevenue} ytdValue={ytdMetrics.opRevenue} />
              <Row label="减：营业成本" periodValue={periodMetrics.opCost} ytdValue={ytdMetrics.opCost} indent isNegative />
              <Row label="期间费用合计" periodValue={periodMetrics.periodExp} ytdValue={ytdMetrics.periodExp} indent isNegative />
              {/* Period expenses breakdown */}
              {(periodByCategory.get("PERIOD_EXPENSE")?.items ?? []).map((b, i) => {
                const ytdB = ytdByCategory.get("PERIOD_EXPENSE")?.items.find(x => x.reportCategory === b.reportCategory);
                return (
                  <tr key={i} className="hover:bg-muted/10 border-b">
                    <td className="px-4 py-2 text-xs text-muted-foreground pl-12">
                      {b.reportCategory ? CATEGORY_LABELS[b.reportCategory] ?? b.reportCategory : "其他期间费用"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">({fmt(b.balance)})</td>
                    <td className="px-4 py-2 text-right font-mono text-xs text-muted-foreground">({fmt(ytdB?.balance ?? 0)})</td>
                  </tr>
                );
              })}
              {/* CAS 2 权益法投资收益（仅当存在权益法成员时显示） */}
              {equityItems.length > 0 && (
                <tr className="hover:bg-violet-50/20 border-b text-violet-700">
                  <td className="px-4 py-2 text-sm pl-8">加：投资收益（权益法，CAS 2）</td>
                  <td className="px-4 py-2 text-right font-mono text-sm">{fmt(equityIncomePeriod)}</td>
                  <td className="px-4 py-2 text-right font-mono text-sm text-muted-foreground">{fmt(equityIncomeYtd)}</td>
                </tr>
              )}
              <Row label="二、营业利润" periodValue={adjOpProfitPeriod} ytdValue={adjOpProfitYtd} isSubtotal isBold />

              {/* Non-operating */}
              <tr className="bg-muted/10 border-b">
                <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  营业外收支
                </td>
              </tr>
              <Row label="加：营业外收入" periodValue={periodMetrics.nonOpIncome} ytdValue={ytdMetrics.nonOpIncome} />
              <Row label="减：营业外支出" periodValue={periodMetrics.nonOpExpense} ytdValue={ytdMetrics.nonOpExpense} indent isNegative />
              <Row label="三、利润总额" periodValue={adjTotalProfitPeriod} ytdValue={adjTotalProfitYtd} isSubtotal isBold />

              {/* Tax & net profit */}
              <tr className="bg-muted/10 border-b">
                <td colSpan={3} className="px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  所得税及净利润
                </td>
              </tr>
              <Row label="减：所得税费用" periodValue={periodMetrics.incomeTax} ytdValue={ytdMetrics.incomeTax} indent isNegative />
            </tbody>
            <tfoot className="border-t-2 bg-primary/5">
              <tr className="font-bold">
                <td className="px-4 py-3">四、净利润</td>
                <td className={`px-4 py-3 text-right font-mono ${adjNetProfitPeriod < 0 ? "text-red-600" : ""}`}>
                  {fmt(adjNetProfitPeriod)}
                </td>
                <td className={`px-4 py-3 text-right font-mono ${adjNetProfitYtd < 0 ? "text-red-600" : ""}`}>
                  {fmt(adjNetProfitYtd)}
                </td>
              </tr>
              {/* CAS 33: NCI profit attribution — only when there are non-wholly-owned subsidiaries */}
              {hasMultipleMembers && (nci.nciProfitPeriod !== 0 || nci.nciProfitYtd !== 0) && (
                <>
                  <tr className="border-t text-sm">
                    <td className="px-4 py-2 pl-8 text-muted-foreground">
                      其中：归属母公司所有者的净利润
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                      {fmt(adjNetProfitPeriod - nci.nciProfitPeriod)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                      {fmt(adjNetProfitYtd - nci.nciProfitYtd)}
                    </td>
                  </tr>
                  <tr className="text-sm">
                    <td className="px-4 py-2 pl-8 text-muted-foreground">
                      少数股东损益
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-indigo-600">
                      {fmt(nci.nciProfitPeriod)}
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-indigo-600">
                      {fmt(nci.nciProfitYtd)}
                    </td>
                  </tr>
                </>
              )}
            </tfoot>
          </table>
        </div>
      )}

      {/* CAS 2 权益法说明 */}
      {equityItems.length > 0 && (
        <div className="no-print rounded-lg border p-4 text-xs bg-violet-50 border-violet-200 text-violet-800">
          <strong>CAS 2 投资收益说明：</strong>
          已按权益法确认以下联营企业投资收益（本期/累计）：
          {equityItems.map((e) => (
            <span key={e.memberId}>
              {" · "}{e.companyName}（{(e.ownershipPct * 100).toFixed(1)}%持股，
              本期投资收益 ¥{fmt(e.investmentIncomePeriod)}，
              累计 ¥{fmt(e.investmentIncomeYtd)}）
            </span>
          ))}
          {" "}投资收益 = 被投资方净利润 × 持股比例，已纳入营业利润。
        </div>
      )}

      {fullMembers.length > 1 && (
        <div className={`no-print rounded-lg border p-4 text-xs ${
          nci.nciProfitPeriod !== 0 || nci.nciProfitYtd !== 0
            ? "bg-blue-50 border-blue-200 text-blue-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {nci.nciProfitPeriod !== 0 || nci.nciProfitYtd !== 0 ? (
            <>
              <strong>CAS 33 调整说明：</strong>净利润已在归属母公司与少数股东之间按持股比例分配。
              内部往来交易（销售收入/成本等）尚未自动消除，请在录入凭证时正确标记内部交易。
            </>
          ) : (
            <>
              <strong>注意：</strong>所有子公司为全资子公司（持股100%），无少数股东损益。
              内部往来交易尚未自动消除，请在录入凭证时标记内部交易（isIntercompany）。
            </>
          )}
        </div>
      )}
    </div>
  );
}
