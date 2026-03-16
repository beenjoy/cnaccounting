import React from "react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/ui/print-button";
import {
  loadGroupInfo,
  computeConsolidatedBalances,
  type ConsolidationMemberInfo,
} from "@/lib/consolidation-utils";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "资产",
  LIABILITY: "负债",
  EQUITY: "所有者权益",
  REVENUE: "收入",
  EXPENSE: "费用",
};

const ACCOUNT_TYPE_ORDER = ["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"];

interface SearchParams { year?: string; month?: string; }

export default async function ConsolidatedTrialBalancePage({
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

  // Verify membership
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

  // Group by accountType
  const byType = new Map<string, typeof balances>();
  for (const b of balances) {
    if (!byType.has(b.accountType)) byType.set(b.accountType, []);
    byType.get(b.accountType)!.push(b);
  }

  const totalDebit = balances
    .filter((b) => b.normalBalance === "DEBIT")
    .reduce((s, b) => s + Math.max(b.balance, 0), 0);
  const totalCredit = balances
    .filter((b) => b.normalBalance === "CREDIT")
    .reduce((s, b) => s + Math.max(b.balance, 0), 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // Available years
  const availableYears = [...new Set(
    await db.fiscalYear.findMany({
      where: { companyId: { in: fullMembers.map(m => m.companyId) } },
      select: { year: true },
      distinct: ["year"],
      orderBy: { year: "desc" },
    }).then(rows => rows.map(r => r.year))
  )];

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/consolidation" className="text-sm text-muted-foreground hover:text-foreground">合并报表</Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/consolidation/${groupId}`} className="text-sm text-muted-foreground hover:text-foreground">{group.name}</Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">合并试算表</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">合并试算表</h1>
          <PrintButton />
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

      {members.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          尚未添加成员公司，请先<Link href={`/consolidation/${groupId}`} className="text-primary hover:underline mx-1">配置合并组</Link>
        </div>
      ) : balances.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          所选期间暂无已过账凭证数据
        </div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/20 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">科目类型</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">报表分类</th>
                {fullMembers.map(m => (
                  <th key={m.companyId} className="px-4 py-2 text-right font-medium text-muted-foreground text-xs">
                    {m.companyName}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">合并余额</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {ACCOUNT_TYPE_ORDER.filter(t => byType.has(t)).map((accountType) => {
                const rows = byType.get(accountType)!;
                const typeTotal = rows.reduce((s, b) => s + b.balance, 0);
                return (
                  <React.Fragment key={accountType}>
                    <tr className="bg-muted/30">
                      <td colSpan={2 + fullMembers.length + 1}
                        className="px-4 py-2 font-semibold text-xs uppercase tracking-wide text-muted-foreground">
                        {ACCOUNT_TYPE_LABELS[accountType] ?? accountType}
                      </td>
                    </tr>
                    {rows.map((b, i) => (
                      <tr key={`${accountType}-${i}`} className="hover:bg-muted/20">
                        <td className="px-4 py-2 text-muted-foreground">
                          {ACCOUNT_TYPE_LABELS[b.accountType] ?? b.accountType}
                        </td>
                        <td className="px-4 py-2">{b.reportCategory ?? "（未分类）"}</td>
                        {fullMembers.map(m => (
                          <td key={m.companyId} className="px-4 py-2 text-right font-mono text-muted-foreground text-xs">
                            {b.byCompany[m.companyId] !== undefined
                              ? fmt(b.byCompany[m.companyId])
                              : "—"}
                          </td>
                        ))}
                        <td className="px-4 py-2 text-right font-mono font-medium">{fmt(b.balance)}</td>
                      </tr>
                    ))}
                    <tr className="bg-muted/10 font-medium">
                      <td colSpan={2} className="px-4 py-2 text-right text-muted-foreground">
                        小计
                      </td>
                      {fullMembers.map(m => (
                        <td key={m.companyId} className="px-4 py-2 text-right font-mono text-sm">
                          {fmt(rows.reduce((s, b) => s + (b.byCompany[m.companyId] ?? 0), 0))}
                        </td>
                      ))}
                      <td className="px-4 py-2 text-right font-mono">{fmt(typeTotal)}</td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 bg-muted/30">
              <tr className="font-semibold">
                <td colSpan={2} className="px-4 py-2">合计（借/贷）</td>
                {fullMembers.map(m => (
                  <td key={m.companyId} className="px-4 py-2 text-right font-mono text-sm">
                    {fmt(balances.reduce((s, b) => s + (b.byCompany[m.companyId] ?? 0), 0))}
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-mono">{fmt(totalDebit)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
