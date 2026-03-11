import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TrialBalanceReport } from "./trial-balance-report";

export default async function TrialBalancePage({
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

  let balanceData: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
    closingDebit: number;
    closingCredit: number;
  }> = [];

  if (selectedPeriodId) {
    // 获取该期间的所有已过账凭证明细
    const lines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: company.id,
          fiscalPeriodId: selectedPeriodId,
          status: "POSTED",
        },
      },
      include: {
        account: {
          select: { code: true, name: true, accountType: true, normalBalance: true },
        },
      },
    });

    // 按科目汇总
    const accountMap = new Map<
      string,
      {
        code: string;
        name: string;
        type: string;
        debit: number;
        credit: number;
      }
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
      entry.debit += parseFloat(line.debitAmountLC.toString());
      entry.credit += parseFloat(line.creditAmountLC.toString());
    }

    // 转换为试算表格式
    balanceData = Array.from(accountMap.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((acc) => {
        const netDebit = Math.max(0, acc.debit - acc.credit);
        const netCredit = Math.max(0, acc.credit - acc.debit);
        return {
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          openingDebit: 0,
          openingCredit: 0,
          periodDebit: acc.debit,
          periodCredit: acc.credit,
          closingDebit: netDebit,
          closingCredit: netCredit,
        };
      });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">试算表</h1>
        <p className="text-muted-foreground mt-1">按期间汇总所有已过账凭证的借贷余额</p>
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
      />
    </div>
  );
}
