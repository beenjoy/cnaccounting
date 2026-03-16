/**
 * 合并资产负债表
 *
 * 在简单加总的基础上，按 CAS 33 要求计算：
 *   1. 长期股权投资与子公司所有者权益的相互抵消（投资抵消）
 *   2. 少数股东权益（NCI）独立列示
 *
 * 平衡检验（调整后）：
 *   调整后资产 = 负债 + 归属母公司所有者权益 + 少数股东权益
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/ui/print-button";
import {
  loadGroupInfo,
  computeConsolidatedBalances,
  computeNCIAndElimination,
  computeEquityMethodData,
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
  const year  = parseInt(sp.year  ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));

  const members: ConsolidationMemberInfo[] = group.members.map((m) => ({
    id:                   m.id,
    companyId:            m.companyId,
    companyName:          m.company.name,
    memberType:           m.memberType,
    ownershipPct:         Number(m.ownershipPct),
    consolidationMethod:  m.consolidationMethod,
    investmentAccountCode: m.investmentAccountCode,
  }));

  const fullMembers = members.filter(
    (m) => m.consolidationMethod === "FULL" || m.memberType === "PARENT"
  );

  // ── 加总余额（简单合并）──
  const balances = await computeConsolidatedBalances(fullMembers, year, month);

  // ── CAS 33：NCI 与投资抵消计算 ──
  const hasMultipleMembers = fullMembers.length > 1;
  const nci = hasMultipleMembers
    ? await computeNCIAndElimination(fullMembers, year, month)
    : {
        nciEquityTotal: 0, nciProfitPeriod: 0, nciProfitYtd: 0,
        eliminatedAssets: 0, eliminatedEquity: 0, goodwillTotal: 0,
        hasInvestmentData: false, details: [],
      };

  // ── CAS 2：权益法联营企业投资 ──
  const equityItems = await computeEquityMethodData(members, year, month);
  const equityInvestmentTotal = equityItems.reduce((s, e) => s + e.adjustedInvestment, 0);

  // ── 过滤 BS 科目（排除损益类）──
  const bsBalances = balances.filter(
    (b) => ["ASSET", "LIABILITY", "EQUITY"].includes(b.accountType) && b.balance !== 0
  );

  // ── 未结账当期损益（收入-费用，用于 BS 补充列示）──
  const totalRevenue = balances
    .filter((b) => b.accountType === "REVENUE")
    .reduce((s, b) => s + b.balance, 0);
  const totalExpense = balances
    .filter((b) => b.accountType === "EXPENSE")
    .reduce((s, b) => s + b.balance, 0);
  const currentPeriodProfit = totalRevenue - totalExpense;

  // ── 按报表类别分组 ──
  const byCategory = new Map<string, { label: string; items: typeof bsBalances; total: number }>();
  const allCategories = [...ASSET_CATEGORIES, ...LIABILITY_EQUITY_CATEGORIES];
  for (const cat of allCategories) {
    const items = bsBalances.filter((b) => b.reportCategory === cat);
    const total = items.reduce((s, b) => s + b.balance, 0);
    byCategory.set(cat, { label: CATEGORY_LABELS[cat] ?? cat, items, total });
  }
  const uncategorized = bsBalances.filter((b) => !b.reportCategory);

  // ── 原始加总值 ──
  const rawAssetTotal =
    (byCategory.get("CURRENT_ASSET")?.total ?? 0) +
    (byCategory.get("NON_CURRENT_ASSET")?.total ?? 0) +
    uncategorized.filter((b) => b.accountType === "ASSET").reduce((s, b) => s + b.balance, 0);

  const liabilityTotal =
    (byCategory.get("CURRENT_LIABILITY")?.total ?? 0) +
    (byCategory.get("NON_CURRENT_LIABILITY")?.total ?? 0) +
    uncategorized.filter((b) => b.accountType === "LIABILITY").reduce((s, b) => s + b.balance, 0);

  const rawEquityTotal =
    (byCategory.get("EQUITY_ITEM")?.total ?? 0) +
    uncategorized.filter((b) => b.accountType === "EQUITY").reduce((s, b) => s + b.balance, 0) +
    currentPeriodProfit;

  // ── CAS 33 调整后合计 ──
  // 资产侧：减去母公司投资（已包含在加总资产中），加回商誉，再加权益法联营企业投资（未含于全额合并范围）
  const adjustedAssetTotal = rawAssetTotal - nci.eliminatedAssets + nci.goodwillTotal + equityInvestmentTotal;

  // 权益侧：
  //   归属母公司所有者权益 = 加总权益 - 全部子公司权益（eliminatedEquity）
  //   少数股东权益         = nciEquityTotal（从 eliminatedEquity 中分出）
  //   股东权益合计         = 归属母公司 + 少数股东 = 加总权益 - eliminatedEquity + nciEquityTotal
  const parentEquity     = rawEquityTotal - nci.eliminatedEquity;
  const totalEquityAfter = parentEquity + nci.nciEquityTotal;
  const liabilityEquityTotal = liabilityTotal + totalEquityAfter;

  // ── 平衡检验（调整后）──
  const isBalanced = Math.abs(adjustedAssetTotal - liabilityEquityTotal) < 0.01;

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const availableYears = await db.fiscalYear
    .findMany({
      where: { companyId: { in: fullMembers.map((m) => m.companyId) } },
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    })
    .then((rows) => rows.map((r) => r.year));

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

  function CategorySection({ category }: { category: string }) {
    const sec = byCategory.get(category);
    if (!sec || sec.items.length === 0) return null;
    return (
      <>
        <tr className="bg-muted/20">
          <td colSpan={2} className="px-4 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
            {sec.label}
          </td>
        </tr>
        {sec.items.map((b, i) => (
          <tr key={i} className="hover:bg-muted/10">
            <td className="px-4 py-2 text-sm pl-8">
              {b.reportCategory ? CATEGORY_LABELS[b.reportCategory] ?? b.reportCategory : "（未分类）"}
            </td>
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
          <PrintButton />
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {group.name} · 截至 {year}年{month}月末 · 合并范围：{fullMembers.map((m) => m.companyName).join("、")}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="no-print flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs font-medium mb-1">年度</label>
          <select name="year" defaultValue={year} className="rounded-md border px-3 py-1.5 text-sm">
            {availableYears.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">截至期间</label>
          <select name="month" defaultValue={month} className="rounded-md border px-3 py-1.5 text-sm">
            {MONTHS.map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80"
        >
          查询
        </button>
      </form>

      {/* Balance check banner */}
      {bsBalances.length > 0 && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${
          isBalanced
            ? "bg-green-50 border-green-200 text-green-700"
            : "bg-amber-50 border-amber-200 text-amber-700"
        }`}>
          {isBalanced
            ? `✓ 借贷平衡（含CAS 33调整）：调整后资产 = 负债 + 股东权益合计（${fmt(adjustedAssetTotal)}）`
            : `⚠ 不平衡：调整后资产 ${fmt(adjustedAssetTotal)} ≠ 负债+股东权益合计 ${fmt(liabilityEquityTotal)}（差额 ${fmt(adjustedAssetTotal - liabilityEquityTotal)}）`
          }
        </div>
      )}

      {fullMembers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          尚未添加成员公司，请先
          <Link href={`/consolidation/${groupId}`} className="text-primary hover:underline mx-1">
            配置合并组
          </Link>
        </div>
      ) : bsBalances.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          所选期间暂无数据
        </div>
      ) : (
        /* Side-by-side: 资产（左）vs 负债+权益（右） */
        <div className="grid grid-cols-2 gap-4">
          {/* ── Left: Assets ── */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">资产</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                <CategorySection category="CURRENT_ASSET" />
                <CategorySection category="NON_CURRENT_ASSET" />

                {/* CAS 2 权益法联营企业投资（非流动资产末尾） */}
                {equityItems.length > 0 && (
                  <>
                    <tr className="bg-violet-50/30">
                      <td colSpan={2} className="px-4 py-2 text-xs font-semibold text-violet-700">
                        ── 权益法联营企业投资（CAS 2）──
                      </td>
                    </tr>
                    {equityItems.map((e) => (
                      <tr key={e.memberId} className="hover:bg-muted/10">
                        <td className="px-4 py-2 pl-8 text-sm">
                          {e.companyName}（{(e.ownershipPct * 100).toFixed(1)}%持股）
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-sm">{fmt(e.adjustedInvestment)}</td>
                      </tr>
                    ))}
                    <tr className="border-t font-medium text-violet-800">
                      <td className="px-4 py-2 pl-8 text-sm">权益法投资合计</td>
                      <td className="px-4 py-2 text-right font-mono">{fmt(equityInvestmentTotal)}</td>
                    </tr>
                  </>
                )}

                {/* 未分类资产 */}
                {uncategorized.filter((b) => b.accountType === "ASSET").map((b, i) => (
                  <tr key={`u-asset-${i}`} className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-muted-foreground">（未分类）</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(b.balance)}</td>
                  </tr>
                ))}

                {/* CAS 33 投资抵消行 */}
                {nci.hasInvestmentData && nci.eliminatedAssets !== 0 && (
                  <>
                    <tr className="bg-amber-50/40">
                      <td className="px-4 py-2 pl-8 text-sm text-amber-800 italic">
                        减：对子公司长期股权投资（内部抵消）
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-amber-800">
                        ({fmt(nci.eliminatedAssets)})
                      </td>
                    </tr>
                    {nci.goodwillTotal > 0 && (
                      <tr className="bg-amber-50/20">
                        <td className="px-4 py-2 pl-8 text-sm text-amber-700 italic">
                          加：合并商誉（投资成本超出可辨认净资产公允价值部分）
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-amber-700">
                          {fmt(nci.goodwillTotal)}
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
              <tfoot className="border-t-2 bg-muted/30">
                <tr className="font-bold">
                  <td className="px-4 py-2">
                    资产合计{nci.hasInvestmentData ? "（调整后）" : ""}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(adjustedAssetTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* ── Right: Liabilities + Equity ── */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30">
              <h2 className="text-sm font-semibold">负债及股东权益</h2>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {/* Liabilities */}
                <CategorySection category="CURRENT_LIABILITY" />
                <CategorySection category="NON_CURRENT_LIABILITY" />
                {uncategorized.filter((b) => b.accountType === "LIABILITY").map((b, i) => (
                  <tr key={`u-liability-${i}`} className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-muted-foreground">（未分类）</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(b.balance)}</td>
                  </tr>
                ))}

                {/* ── 所有者权益区块 ── */}
                <tr className="bg-muted/20">
                  <td colSpan={2} className="px-4 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                    {hasMultipleMembers ? "归属母公司所有者权益" : "所有者权益"}
                  </td>
                </tr>

                {/* 权益科目明细 */}
                {(byCategory.get("EQUITY_ITEM")?.items ?? []).map((b, i) => (
                  <tr key={`eq-${i}`} className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-sm">
                      {CATEGORY_LABELS[b.reportCategory ?? ""] ?? "（未分类）"}
                    </td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(b.balance)}</td>
                  </tr>
                ))}

                {/* 本年利润（未结账） */}
                {currentPeriodProfit !== 0 && (
                  <tr className="hover:bg-muted/10">
                    <td className="px-4 py-2 pl-8 text-sm text-muted-foreground">本年利润（未结账）</td>
                    <td className="px-4 py-2 text-right font-mono text-muted-foreground">
                      {fmt(currentPeriodProfit)}
                    </td>
                  </tr>
                )}

                {/* CAS 33 投资抵消：从权益中扣除全部子公司权益 */}
                {hasMultipleMembers && nci.eliminatedEquity !== 0 && (
                  <tr className="bg-amber-50/40">
                    <td className="px-4 py-2 pl-8 text-sm text-amber-800 italic">
                      减：子公司所有者权益（合并抵消）
                    </td>
                    <td className="px-4 py-2 text-right font-mono text-amber-800">
                      ({fmt(nci.eliminatedEquity)})
                    </td>
                  </tr>
                )}

                {/* 归属母公司所有者权益合计（仅多成员时拆分） */}
                {hasMultipleMembers && (
                  <tr className="border-t font-semibold bg-blue-50/30">
                    <td className="px-4 py-2 pl-8 text-sm">归属母公司所有者权益合计</td>
                    <td className="px-4 py-2 text-right font-mono text-blue-800">{fmt(parentEquity)}</td>
                  </tr>
                )}

                {/* 少数股东权益（NCI）—— 仅在有非全资子公司时显示 */}
                {nci.nciEquityTotal !== 0 && (
                  <>
                    <tr className="bg-indigo-50/30">
                      <td className="px-4 py-2 pl-8 text-sm font-medium text-indigo-800">少数股东权益（NCI）</td>
                      <td className="px-4 py-2 text-right font-mono font-medium text-indigo-800">
                        {fmt(nci.nciEquityTotal)}
                      </td>
                    </tr>
                  </>
                )}

                {/* 股东权益合计 */}
                <tr className="border-t font-medium">
                  <td className="px-4 py-2 pl-8">
                    {hasMultipleMembers ? "股东权益合计" : "所有者权益合计"}
                  </td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(totalEquityAfter)}</td>
                </tr>
              </tbody>
              <tfoot className="border-t-2 bg-muted/30">
                <tr className="font-bold">
                  <td className="px-4 py-2">负债和股东权益合计</td>
                  <td className="px-4 py-2 text-right font-mono">{fmt(liabilityEquityTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* CAS 2 权益法说明 */}
      {equityItems.length > 0 && bsBalances.length > 0 && (
        <div className="no-print rounded-lg border p-4 text-xs bg-violet-50 border-violet-200 text-violet-800">
          <strong>CAS 2 权益法说明：</strong>
          以下联营企业按权益法列示于非流动资产，不纳入全额合并范围：
          {equityItems.map((e) => (
            <span key={e.memberId}>
              {" · "}{e.companyName}（持股{(e.ownershipPct * 100).toFixed(1)}%，
              净资产份额 ¥{fmt(e.adjustedInvestment)}
              {e.parentInvestmentBalance !== null
                ? `，账面投资 ¥${fmt(e.parentInvestmentBalance)}`
                : ""}）
            </span>
          ))}
          {" "}权益法投资额 = 被投资方净资产 × 持股比例。
        </div>
      )}

      {/* CAS 33 说明 */}
      {hasMultipleMembers && bsBalances.length > 0 && (
        <div className={`no-print rounded-lg border p-4 text-xs ${
          nci.hasInvestmentData
            ? "bg-blue-50 border-blue-200 text-blue-800"
            : "bg-amber-50 border-amber-200 text-amber-800"
        }`}>
          {nci.hasInvestmentData ? (
            <>
              <strong>CAS 33 调整说明：</strong>本报表已按《合并财务报表》准则进行少数股东权益拆分及长期股权投资抵消。
              {nci.details.map((d) => (
                <span key={d.memberId}>
                  {" · "}{d.subsidiaryName}（持股{(d.ownershipPct * 100).toFixed(0)}%，NCI={fmt(d.nciEquity)}
                  {d.goodwill !== null && d.goodwill > 0 ? `，商誉=${fmt(d.goodwill)}` : ""}）
                </span>
              ))}
              {" · "}内部往来凭证（标记为 isIntercompany）如已录入，请在凭证录入时使用内部往来标记，本报表暂未自动消除未标记的内部交易。
            </>
          ) : (
            <>
              <strong>注意：</strong>
              已计算少数股东权益（NCI）。如需完整投资抵消，请在合并组成员设置中配置各子公司对应的「长期股权投资科目编码」（如1511）。
              内部往来交易尚未自动消除，请在录入凭证时标记内部交易（isIntercompany）。
            </>
          )}
        </div>
      )}
    </div>
  );
}
