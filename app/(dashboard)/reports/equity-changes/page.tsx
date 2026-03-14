import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";

function fmt(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

export default async function EquityChangesPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { periodId } = await searchParams;

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  // 获取所有期间
  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    include: { fiscalYear: { select: { year: true } } },
    orderBy: [{ fiscalYear: { year: "desc" } }, { periodNumber: "desc" }],
  });

  const now = new Date();
  const currentPeriod = periods.find(
    (p) => p.fiscalYear.year === now.getFullYear() && p.periodNumber === now.getMonth() + 1
  );
  const selectedPeriodId =
    periodId || currentPeriod?.id || periods.find((p) => p.status === "OPEN")?.id || periods[0]?.id;

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  // 获取所有 EQUITY 科目（动态，适配不同模板）
  const equityAccounts = await db.chartOfAccount.findMany({
    where: { companyId: company.id, accountType: "EQUITY", isActive: true },
    orderBy: { code: "asc" },
  });

  // 期初余额：selectedPeriod.startDate 之前所有 POSTED 行
  // 本期发生：selectedPeriodId 期间的所有 POSTED 行
  type AccBalance = { openingNet: number; periodDebit: number; periodCredit: number };
  const balances = new Map<string, AccBalance>();
  for (const acc of equityAccounts) {
    balances.set(acc.id, { openingNet: 0, periodDebit: 0, periodCredit: 0 });
  }

  if (selectedPeriod) {
    // 期初余额行（按 endDate < startDate 查所有已过账行）
    const openingLines = await db.journalEntryLine.findMany({
      where: {
        accountId: { in: equityAccounts.map((a) => a.id) },
        journalEntry: {
          companyId: company.id,
          status: "POSTED",
          fiscalPeriod: { endDate: { lt: selectedPeriod.startDate } },
        },
      },
    });
    for (const line of openingLines) {
      const b = balances.get(line.accountId);
      if (b) {
        b.openingNet += parseFloat(line.creditAmountLC.toString()) - parseFloat(line.debitAmountLC.toString());
      }
    }

    // 本期发生
    const periodLines = await db.journalEntryLine.findMany({
      where: {
        accountId: { in: equityAccounts.map((a) => a.id) },
        journalEntry: { companyId: company.id, status: "POSTED", fiscalPeriodId: selectedPeriodId },
      },
    });
    for (const line of periodLines) {
      const b = balances.get(line.accountId);
      if (b) {
        b.periodDebit += parseFloat(line.debitAmountLC.toString());
        b.periodCredit += parseFloat(line.creditAmountLC.toString());
      }
    }
  }

  // 计算合计列
  const rows = equityAccounts.map((acc) => {
    const b = balances.get(acc.id)!;
    const periodIncrease = b.periodCredit; // 贷方增加
    const periodDecrease = b.periodDebit;  // 借方减少
    const closingNet = b.openingNet + periodIncrease - periodDecrease;
    return {
      id: acc.id,
      code: acc.code,
      name: acc.name,
      openingNet: b.openingNet,
      periodIncrease,
      periodDecrease,
      closingNet,
    };
  });

  const total = {
    openingNet: rows.reduce((s, r) => s + r.openingNet, 0),
    periodIncrease: rows.reduce((s, r) => s + r.periodIncrease, 0),
    periodDecrease: rows.reduce((s, r) => s + r.periodDecrease, 0),
    closingNet: rows.reduce((s, r) => s + r.closingNet, 0),
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">所有者权益变动表</h1>
        <p className="text-muted-foreground mt-1">展示各权益科目期初、本期增减和期末余额</p>
      </div>

      {/* 期间选择 */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">会计期间：</span>
        <form method="GET" action="/reports/equity-changes" className="flex items-center gap-2">
          <select
            name="periodId"
            defaultValue={selectedPeriodId}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（{p.status === "OPEN" ? "开放" : "已关闭"}）
              </option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            查询
          </button>
        </form>
      </div>

      {equityAccounts.length === 0 ? (
        <p className="text-center text-muted-foreground py-12 text-sm">暂无权益类科目</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">科目</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">期初余额</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">本期增加（贷）</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">本期减少（借）</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">期末余额</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{row.code}</span>
                    <Link
                      href={`/ledger?accountId=${row.id}&periodId=${selectedPeriodId}`}
                      className="hover:underline text-primary"
                    >
                      {row.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(row.openingNet)}</td>
                  <td className="px-4 py-3 text-right font-mono text-green-700">{fmt(row.periodIncrease)}</td>
                  <td className="px-4 py-3 text-right font-mono text-red-600">{fmt(row.periodDecrease)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{fmt(row.closingNet)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 bg-muted/30">
              <tr>
                <td className="px-4 py-3 font-semibold">合计</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(total.openingNet)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-green-700">{fmt(total.periodIncrease)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold text-red-600">{fmt(total.periodDecrease)}</td>
                <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(total.closingNet)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        * 仅统计已过账（POSTED）凭证。期初余额为所选期间开始日期之前所有已过账凭证的累计净额。
      </p>
    </div>
  );
}
