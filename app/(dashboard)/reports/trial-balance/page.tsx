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
    periodId ||
    currentPeriod?.id ||
    periods.find((p) => p.status === "OPEN")?.id ||
    periods[0]?.id;

  async function fetchPeriodBalances(pId: string) {
    const selPeriod = await db.fiscalPeriod.findUnique({
      where: { id: pId },
      select: { startDate: true },
    });
    if (!selPeriod) return [];

    type AccEntry = {
      code: string; name: string; type: string;
      openDebit: number; openCredit: number;
      periodDebit: number; periodCredit: number;
    };
    const accountMap = new Map<string, AccEntry>();

    const priorLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: company!.id,
          status: "POSTED",
          fiscalPeriod: { endDate: { lt: selPeriod.startDate } },
        },
      },
      include: { account: { select: { code: true, name: true, accountType: true } } },
    });

    for (const line of priorLines) {
      const key = line.accountId;
      if (!accountMap.has(key)) {
        accountMap.set(key, {
          code: line.account.code, name: line.account.name,
          type: line.account.accountType,
          openDebit: 0, openCredit: 0, periodDebit: 0, periodCredit: 0,
        });
      }
      const e = accountMap.get(key)!;
      e.openDebit  += parseFloat(line.debitAmountLC.toString());
      e.openCredit += parseFloat(line.creditAmountLC.toString());
    }

    const currentLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: { companyId: company!.id, fiscalPeriodId: pId, status: "POSTED" },
      },
      include: { account: { select: { code: true, name: true, accountType: true } } },
    });

    for (const line of currentLines) {
      const key = line.accountId;
      if (!accountMap.has(key)) {
        accountMap.set(key, {
          code: line.account.code, name: line.account.name,
          type: line.account.accountType,
          openDebit: 0, openCredit: 0, periodDebit: 0, periodCredit: 0,
        });
      }
      const e = accountMap.get(key)!;
      e.periodDebit  += parseFloat(line.debitAmountLC.toString());
      e.periodCredit += parseFloat(line.creditAmountLC.toString());
    }

    return Array.from(accountMap.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((acc) => {
        const openNet    = acc.openDebit - acc.openCredit;
        const periodNet  = acc.periodDebit - acc.periodCredit;
        const closingNet = openNet + periodNet;
        return {
          accountCode:   acc.code,
          accountName:   acc.name,
          accountType:   acc.type,
          openingDebit:  Math.max(0,  openNet),
          openingCredit: Math.max(0, -openNet),
          periodDebit:   acc.periodDebit,
          periodCredit:  acc.periodCredit,
          closingDebit:  Math.max(0,  closingNet),
          closingCredit: Math.max(0, -closingNet),
        };
      });
  }

  const balanceData = selectedPeriodId ? await fetchPeriodBalances(selectedPeriodId) : [];

  const compareData =
    comparePeriodId && comparePeriodId !== selectedPeriodId
      ? await fetchPeriodBalances(comparePeriodId)
      : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">试算表</h1>
        <p className="text-muted-foreground mt-1">展示期初余额、本期发生额和期末余额，验证借贷平衡</p>
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
