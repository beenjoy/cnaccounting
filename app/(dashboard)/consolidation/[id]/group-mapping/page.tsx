/**
 * 集团科目对照视图
 *
 * 展示各合并成员公司的本地科目余额如何汇总到集团科目体系。
 * 仅显示有映射数据的末级集团科目。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { loadGroupInfo, findPeriodsByYearMonth, getAvailablePeriods } from "@/lib/consolidation-utils";

interface SearchParams {
  year?: string;
  month?: string;
}

// ── Balance computation ────────────────────────────────────────────────────────

/**
 * For a given set of account IDs (from a single company), compute their
 * cumulative balance up through year/month (YTD for BS accounts).
 * Returns the raw debit/credit sums and normalBalance for computing direction.
 */
async function computeAccountBalance(
  companyId: string,
  accountIds: string[],
  year: number,
  month: number,
): Promise<{ debit: number; credit: number; normalBalance: string } | null> {
  if (accountIds.length === 0) return null;

  // Get account normal balance from the first account
  const sample = await db.chartOfAccount.findUnique({
    where: { id: accountIds[0] },
    select: { normalBalance: true },
  });
  if (!sample) return null;

  // Get all fiscal periods for this company through month
  const periods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId, year },
      periodNumber: { lte: month },
    },
    select: { id: true },
  });
  if (periods.length === 0) return null;

  const agg = await db.journalEntryLine.aggregate({
    where: {
      accountId: { in: accountIds },
      journalEntry: {
        companyId,
        fiscalPeriodId: { in: periods.map((p) => p.id) },
        status: "POSTED",
      },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });

  return {
    debit: parseFloat((agg._sum.debitAmountLC ?? 0).toString()),
    credit: parseFloat((agg._sum.creditAmountLC ?? 0).toString()),
    normalBalance: sample.normalBalance,
  };
}

/**
 * For a company, resolve all local account IDs matching a set of mappings
 * (DIRECT = exact code; RANGE = code between rangeStart and rangeEnd).
 */
async function resolveLocalAccountIds(
  companyId: string,
  mappings: Array<{
    mappingType: string;
    localCode: string | null;
    rangeStart: string | null;
    rangeEnd: string | null;
  }>,
): Promise<string[]> {
  const ids: string[] = [];

  for (const mapping of mappings) {
    if (mapping.mappingType === "DIRECT" && mapping.localCode) {
      const acc = await db.chartOfAccount.findFirst({
        where: { companyId, code: mapping.localCode },
        select: { id: true },
      });
      if (acc) ids.push(acc.id);
    } else if (
      mapping.mappingType === "RANGE" &&
      mapping.rangeStart &&
      mapping.rangeEnd
    ) {
      const accs = await db.chartOfAccount.findMany({
        where: {
          companyId,
          code: { gte: mapping.rangeStart, lte: mapping.rangeEnd },
        },
        select: { id: true },
      });
      ids.push(...accs.map((a) => a.id));
    }
  }

  return [...new Set(ids)];
}

// ── Page component ─────────────────────────────────────────────────────────────

export default async function GroupMappingPage({
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
    select: { organizationId: true },
  });
  if (!orgMember) redirect("/dashboard");

  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));

  // Member companies that are FULL (or PARENT)
  const fullMembers = group.members.filter(
    (m) => m.memberType === "PARENT" || m.consolidationMethod === "FULL"
  );

  const companyIds = fullMembers.map((m) => m.companyId);

  // Available years for the period selector
  const availableYears = await getAvailablePeriods(companyIds);

  // Load all group accounts for this organization (leaf only, ordered by code)
  const groupAccounts = await db.groupAccount.findMany({
    where: {
      organizationId: orgMember.organizationId,
      isLeaf: true,
    },
    orderBy: { code: "asc" },
    include: {
      mappings: {
        where: { companyId: { in: companyIds } },
        select: {
          companyId: true,
          mappingType: true,
          localCode: true,
          rangeStart: true,
          rangeEnd: true,
        },
      },
    },
  });

  // Only show group accounts that have at least one mapping to a member company
  const mappedAccounts = groupAccounts.filter((ga) => ga.mappings.length > 0);

  // For each group account × company, compute the balance
  const fmt = (n: number) =>
    n === 0
      ? "—"
      : new Intl.NumberFormat("zh-CN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(n);

  // Build rows
  type RowData = {
    groupAccount: (typeof mappedAccounts)[0];
    companyBalances: Record<string, { balance: number; localCodes: string[] }>;
    total: number;
  };

  const rows: RowData[] = [];

  for (const ga of mappedAccounts) {
    const companyBalances: RowData["companyBalances"] = {};
    let total = 0;

    for (const member of fullMembers) {
      const companyMappings = ga.mappings.filter(
        (m) => m.companyId === member.companyId
      );
      if (companyMappings.length === 0) continue;

      const accountIds = await resolveLocalAccountIds(
        member.companyId,
        companyMappings
      );

      // Collect local codes for display
      const localCodes = companyMappings
        .map((m) =>
          m.mappingType === "DIRECT"
            ? m.localCode ?? ""
            : `${m.rangeStart}–${m.rangeEnd}`
        )
        .filter(Boolean);

      if (accountIds.length > 0) {
        const balResult = await computeAccountBalance(
          member.companyId,
          accountIds,
          year,
          month
        );
        if (balResult) {
          const balance =
            balResult.normalBalance === "DEBIT"
              ? balResult.debit - balResult.credit
              : balResult.credit - balResult.debit;
          companyBalances[member.companyId] = { balance, localCodes };
          total += balance;
        }
      } else {
        companyBalances[member.companyId] = { balance: 0, localCodes };
      }
    }

    rows.push({ groupAccount: ga, companyBalances, total });
  }

  const ACCOUNT_TYPE_LABELS: Record<string, string> = {
    ASSET: "资产",
    LIABILITY: "负债",
    EQUITY: "所有者权益",
    REVENUE: "收入",
    EXPENSE: "费用",
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1 text-sm text-muted-foreground">
          <Link href="/consolidation" className="hover:text-foreground">合并报表</Link>
          <span>/</span>
          <Link href={`/consolidation/${groupId}`} className="hover:text-foreground">{group.name}</Link>
          <span>/</span>
          <span className="text-foreground font-medium">集团科目对照</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">集团科目对照</h1>
        <p className="text-sm text-muted-foreground mt-1">
          显示各成员公司本地科目余额按集团科目体系汇总的对照视图
        </p>
      </div>

      {/* Period selector */}
      <form method="GET" className="flex items-center gap-3">
        <select
          name="year"
          defaultValue={year}
          className="h-9 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {availableYears.length === 0 && (
            <option value={year}>{year}年</option>
          )}
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}年</option>
          ))}
        </select>
        <select
          name="month"
          defaultValue={month}
          className="h-9 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>{m}月</option>
          ))}
        </select>
        <button
          type="submit"
          className="h-9 px-4 rounded-md border bg-primary text-primary-foreground text-sm hover:bg-primary/90"
        >
          查询
        </button>
      </form>

      {/* No mappings state */}
      {mappedAccounts.length === 0 ? (
        <div className="rounded-lg border bg-white py-16 text-center text-muted-foreground">
          <p className="text-sm font-medium">暂无集团科目映射数据</p>
          <p className="text-xs mt-1">
            请先在
            <Link href="/settings/group-accounts" className="text-primary hover:underline mx-1">
              系统设置 → 集团科目表
            </Link>
            中为本合并组的成员公司创建科目映射
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-4 py-2.5 text-left font-medium text-muted-foreground w-48 sticky left-0 bg-muted/30">
                  集团科目
                </th>
                <th className="px-3 py-2.5 text-left font-medium text-muted-foreground w-20">
                  类型
                </th>
                {fullMembers.map((m) => (
                  <th
                    key={m.companyId}
                    className="px-4 py-2.5 text-right font-medium text-muted-foreground min-w-36"
                  >
                    {m.company.name}
                  </th>
                ))}
                <th className="px-4 py-2.5 text-right font-medium text-foreground min-w-32">
                  合计
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ groupAccount: ga, companyBalances, total }) => (
                <tr key={ga.id} className="hover:bg-muted/10">
                  <td className="px-4 py-2.5 sticky left-0 bg-white">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{ga.code}</span>
                    <span className="font-medium">{ga.name}</span>
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground text-xs">
                    {ACCOUNT_TYPE_LABELS[ga.accountType] ?? ga.accountType}
                  </td>
                  {fullMembers.map((m) => {
                    const entry = companyBalances[m.companyId];
                    return (
                      <td
                        key={m.companyId}
                        className="px-4 py-2.5 text-right font-mono text-sm"
                      >
                        {entry ? (
                          <div>
                            <div className={entry.balance !== 0 ? "text-foreground" : "text-muted-foreground"}>
                              {fmt(entry.balance)}
                            </div>
                            {entry.localCodes.length > 0 && (
                              <div className="text-xs text-muted-foreground">
                                {entry.localCodes.join(", ")}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2.5 text-right font-mono font-semibold">
                    {fmt(total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t bg-muted/20">
              <tr>
                <td colSpan={2} className="px-4 py-2.5 font-semibold text-sm sticky left-0 bg-muted/20">
                  合计
                </td>
                {fullMembers.map((m) => {
                  const colTotal = rows.reduce((sum, r) => {
                    return sum + (r.companyBalances[m.companyId]?.balance ?? 0);
                  }, 0);
                  return (
                    <td key={m.companyId} className="px-4 py-2.5 text-right font-mono font-semibold">
                      {fmt(colTotal)}
                    </td>
                  );
                })}
                <td className="px-4 py-2.5 text-right font-mono font-bold">
                  {fmt(rows.reduce((s, r) => s + r.total, 0))}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Info */}
      {mappedAccounts.length > 0 && (
        <p className="text-xs text-muted-foreground">
          余额为 {year}年{month}月末累计数（仅含已过账凭证）。"—"表示无数据或余额为零。
          仅显示末级集团科目且有映射的行。
        </p>
      )}
    </div>
  );
}
