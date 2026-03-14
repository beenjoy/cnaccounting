import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import {
  loadGroupInfo,
  computeConsolidatedBalances,
  type ConsolidationMemberInfo,
} from "@/lib/consolidation-utils";

const CATEGORY_LABELS: Record<string, string> = {
  CURRENT_ASSET:          "流动资产",
  NON_CURRENT_ASSET:      "非流动资产",
  CURRENT_LIABILITY:      "流动负债",
  NON_CURRENT_LIABILITY:  "非流动负债",
  EQUITY_ITEM:            "所有者权益",
};

const ASSET_CATEGORIES = ["CURRENT_ASSET", "NON_CURRENT_ASSET"] as const;
const LIABILITY_EQUITY_CATEGORIES = ["CURRENT_LIABILITY", "NON_CURRENT_LIABILITY", "EQUITY_ITEM"] as const;

interface SearchParams { year?: string; month?: string; }

export default async function ConsolidatedBalanceSheetPage({
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
  const balances = await computeConsolidatedBalances(fullMembers, year, month);

  // Separate BS accounts (exclude revenue/expense)
  const bsBalances = balances.filter((b) =>
    ["ASSET", "LIABILITY", "EQUITY"].includes(b.accountType) && b.balance !== 0
  );

  // Infer current-period profit from revenue/expense (before year-end close)
  const totalRevenue = balances
    .filter((b) => b.accountType === "REVENUE")
    .reduce((s, b) => s + b.balance, 0);
  const totalExpense = balances
    .filter((b) => b.accountType === "EXPENSE")
    .reduce((s, b) => s + b.balance, 0);
  const currentPeriodProfit = totalRevenue - totalExpense;

  // Group by reportCategory
  const byCategory = new Map<string, { label: string; items: typeof bsBalances; total: number }>();
  const allCategories = [...ASSET_CATEGORIES, ...LIABILITY_EQUITY_CATEGORIES];
  for (const cat of allCategories) {
    const items = bsBalances.filter((b) => b.reportCategory === cat);
    const total = items.reduce((s, b) => s + b.balance, 0);
    byCategory.set(cat, { label: CATEGORY_LABELS[cat] ?? cat, items, total });
  }

  // Uncategorized BS items
  const uncategorized = bsBalances.filter((b) => !b.reportCategory);

  const assetTotal =
    (byCategory.get("CURRENT_ASSET")?.total ?? 0) +
    (byCategory.get("NON_CURRENT_ASSET")?.total ?? 0) +
    uncategorized.filter((b) => b.accountType === "ASSET").reduce((s, b) => s + b.balance, 0);

  const liabilityTotal =
    (byCategory.get("CURRENT_LIABILITY")?.total ?? 0) +
    (byCategory.get("NON_CURRENT_LIABILITY")?.total ?? 0) +
    uncategorized.filter((b) => b.accountType === "LIABILITY").reduce((s, b) => s + b.balance, 0);

  const equityTotal =
    (byCategory.get("EQUITY_ITEM")?.total ?? 0) +
    uncategorized.filter((b) => b.accountType === "EQUITY").reduce((s, b) => s + b.balance, 0) +
    currentPeriodProfit;

  const liabilityEquityTotal = liabilityTotal + equityTotal;

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const availableYears = await db.fiscalYear.findMany({
    where: { companyId: { in: fullMembers.map((m) => m.companyId) } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  }).then(rows => rows.map(r => r.year));

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

  function CategorySection({ category }: { category: string }) {
    const sec = byCategory.get(category);
    if (!sec) return null;
    return (
      <>
        <tr className="bg-muted/20">
          <td colSpan={2} className="px-4 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
            {sec.label}
          </td>
        </tr>
        {sec.items.map((b, i) => (
          <tr key={i} className="hover:bg-muted/10">
            <td className="px-4 py-2 text-sm pl-8">{b.reportCategory ? CATEGORY_LABELS[b.reportCategory] ?? b.reportCategory : "（未分类）"}</td>
            <td className="px-4 py-2 text-right font-mono text-sm">{fmt(b.balance)}</td>
          </tr>
        ))}
        <tr className="border-t font-medium">
          <td className="px-4 py-2 pl-8 text-sm">{sec.label}合计</td>
          <td className="px-4 py-2 text-right font-mono">{fmt(sec.total)}</td>
        </tr>
      </>
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
          <span className="text-sm font-medium">合并资产负债表</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">合并资产负债表</h1>
          <button onClick={() => typeof window !== "undefined" && window.print()}
            className="no-print rounded-md border px-4 py-2 text-sm hover:bg-muted">打印</button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {group.name} · 截至 {year}年{month}月末 · 合并范围：{fullMembers.map(m => m.companyName).join("、")}
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
          <label className="block text-xs font-medium mb-1">截至期间</label>
          <select name="month" defaultValue={month} className="rounded-md border px-3 py-1.5 text-sm">
            {MONTHS.map(m => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">查询</button>
      </form>

      {/* Balance check banner */}
      {bsBalances.length > 0 && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${Math.abs(assetTotal - liabilityEquityTotal) < 0.01
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
          }`}>
          {Math.abs(assetTotal - liabilityEquityTotal) < 0.01
            ? `✓ 借贷平衡：资产合计 = 负债+所有者权益合计（${fmt(assetTotal)}）`
            : `⚠ 不平衡：资产合计 ${fmt(assetTotal)} ≠ 负债+所有者权益合计 ${fmt(liabilityEquityTotal)}（差额 ${fmt(assetTotal - liabilityEquityTotal)}）`
          }
        </div>
      )}

      {fullMembers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          尚未添加成员公司，请先<Link href={`/consolidation/${groupId}`} className="text-primary hover:underline mx-1">配置合并组</Link>
        </div>
      ) : bsBalances.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">所选期间暂无数据</div>
      ) : (
        /* Side-by-side layout: Assets left, Liabilities+Equity right */
        <div className="grid grid-cols-2 gap-4">
          {/* Left: Assets */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">资产</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <CategorySection category="CURRENT_ASSET" />
                <CategorySection category="NON_CURRENT_ASSET" />
                {uncategorized.filter(b => b.accountType === "ASSET").map((b, i) => (
                  <tr key={`u-asset-${i}`} className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-muted-foreground">（未分类）</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(b.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-muted/30">
                <tr className="font-bold">
                  <td className="px-4 py-2">资产合计</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(assetTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Right: Liabilities + Equity */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">负债及所有者权益</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <CategorySection category="CURRENT_LIABILITY" />
                <CategorySection category="NON_CURRENT_LIABILITY" />
                {uncategorized.filter(b => b.accountType === "LIABILITY").map((b, i) => (
                  <tr key={`u-liability-${i}`} className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-muted-foreground">（未分类）</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(b.balance)}</td>
                  </tr>
                ))}
                <tr className="bg-muted/20">
                  <td colSpan={2} className="px-4 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">所有者权益</td>
                </tr>
                {(byCategory.get("EQUITY_ITEM")?.items ?? []).map((b, i) => (
                  <tr key={`eq-${i}`} className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-sm">{CATEGORY_LABELS[b.reportCategory ?? ""] ?? "（未分类）"}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(b.balance)}</td>
                  </tr>
                ))}
                {currentPeriodProfit !== 0 && (
                  <tr className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-sm text-muted-foreground">本年利润（未结账）</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmt(currentPeriodProfit)}</td>
                  </tr>
                )}
                <tr className="border-t font-medium">
                  <td className="px-4 py-2 pl-8">所有者权益合计</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(equityTotal)}</td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 bg-muted/30">
                <tr className="font-bold">
                  <td className="px-4 py-2">负债和所有者权益合计</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(liabilityEquityTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Intercompany notice */}
      {fullMembers.length > 1 && (
        <div className="no-print bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs text-amber-800">
          <strong>注意：</strong>本报表为简单加总合并，尚未消除集团内部交易（如内部应收/应付、长期股权投资与子公司实收资本的抵消）。
          如需精确合并报表，请在录入凭证时标记内部交易，并手动调整上述抵消金额。
        </div>
      )}
    </div>
  );
}
