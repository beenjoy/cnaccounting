import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TrialBalanceReport } from "./trial-balance-report";

export default async function TrialBalancePage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; comparePeriodId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { periodId, comparePeriodId } = await searchParams;

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  // 获取所有会计期间
  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    include: { fiscalYear: { select: { year: true } } },
    orderBy: [{ fiscalYear: { year: "desc" } }, { periodNumber: "desc" }],
  });

  // 默认取当前月份的期间，否则最近的开放期间
  const now = new Date();
  const currentPeriod = periods.find(
    (p) => p.fiscalYear.year === now.getFullYear() && p.periodNumber === now.getMonth() + 1
  );
  const selectedPeriodId =
    periodId ||
    currentPeriod?.id ||
    periods.find((p) => p.status === "OPEN")?.id ||
    periods[0]?.id;

  async function fetchPeriodBalances(pId: string) {
    const lines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: { companyId: company!.id, fiscalPeriodId: pId, status: "POSTED" },
      },
      include: {
        account: { select: { code: true, name: true, accountType: true } },
      },
    });

    const accountMap = new Map<
      string,
      { code: string; name: string; type: string; debit: number; credit: number }
    >();

    for (const line of lines) {
      const key = line.accountId;
      if (!accountMap.has(key)) {
        accountMap.set(key, {
          code: line.account.code,
          name: line.account.name,
          type: line.account.accountType,
          debit: 0,
          credit: 0,
        });
      }
      const entry = accountMap.get(key)!;
      entry.debit  += parseFloat(line.debitAmountLC.toString());
      entry.credit += parseFloat(line.creditAmountLC.toString());
    }

    return Array.from(accountMap.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((acc) => ({
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: acc.debit,
        periodCredit: acc.credit,
        closingDebit:  Math.max(0, acc.debit - acc.credit),
        closingCredit: Math.max(0, acc.credit - acc.debit),
      }));
  }

  const balanceData = selectedPeriodId ? await fetchPeriodBalances(selectedPeriodId) : [];

  // 对比期间数据
  const compareData =
    comparePeriodId && comparePeriodId !== selectedPeriodId
      ? await fetchPeriodBalances(comparePeriodId)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">试算表</h1>
        <p className="text-muted-foreground mt-1">按期间汇总所有已过账凭证的借贷余额，支持对比分析与 CSV 导出</p>
      </div>
      <TrialBalanceReport
        periods={periods.map((p) => ({
          id: p.id,
          name: p.name,
          year: p.fiscalYear.year,
          status: p.status,
        }))}
        selectedPeriodId={selectedPeriodId || ""}
        balanceData={balanceData}
        comparePeriodId={comparePeriodId}
        compareData={compareData}
      />
    </div>
  );
}
