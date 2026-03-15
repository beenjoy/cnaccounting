import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { BalanceSheetReport } from "./balance-sheet-report";

export default async function BalanceSheetPage({
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

  // 获取所有会计期间（含年度信息和日期）
  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    include: { fiscalYear: { select: { year: true, id: true } } },
    orderBy: [{ fiscalYear: { year: "desc" } }, { periodNumber: "desc" }],
  });

  // 默认当前月，否则最近的期间
  const now = new Date();
  const currentPeriod = periods.find(
    (p) => p.fiscalYear.year === now.getFullYear() && p.periodNumber === now.getMonth() + 1
  );
  const selectedPeriodId =
    periodId ||
    currentPeriod?.id ||
    periods.find((p) => p.status === "OPEN")?.id ||
    periods[0]?.id;

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  // ── 类型定义 ─────────────────────────────────────────────────────
  type AccountBalance = {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    reportCategory: string | null;
    balance: number;
  };

  type RawLine = {
    accountId: string;
    debitAmountLC: Decimal | null;
    creditAmountLC: Decimal | null;
    account: {
      id: string;
      code: string;
      name: string;
      accountType: string;
      normalBalance: string;
      reportCategory: string | null;
    };
  };

  // ── 辅助：将凭证行聚合为余额列表 ────────────────────────────────
  function aggregateLines(lines: RawLine[]): AccountBalance[] {
    const map = new Map<
      string,
      {
        accountId: string; code: string; name: string;
        type: string; normalBalance: string; reportCategory: string | null;
        totalDebit: number; totalCredit: number;
      }
    >();
    for (const line of lines) {
      const key = line.accountId;
      if (!map.has(key)) {
        map.set(key, {
          accountId: key,
          code: line.account.code,
          name: line.account.name,
          type: line.account.accountType,
          normalBalance: line.account.normalBalance,
          reportCategory: line.account.reportCategory,
          totalDebit: 0,
          totalCredit: 0,
        });
      }
      const e = map.get(key)!;
      e.totalDebit += toNum(line.debitAmountLC);
      e.totalCredit += toNum(line.creditAmountLC);
    }
    return Array.from(map.values())
      .map((acc) => ({
        accountId: acc.accountId,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        normalBalance: acc.normalBalance,
        reportCategory: acc.reportCategory,
        balance:
          acc.normalBalance === "DEBIT"
            ? acc.totalDebit - acc.totalCredit
            : acc.totalCredit - acc.totalDebit,
      }))
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }

  const accountSelect = {
    select: {
      id: true,
      code: true,
      name: true,
      accountType: true,
      normalBalance: true,
      reportCategory: true,
    },
  } as const;

  let accountBalances: AccountBalance[] = [];
  let priorYearBalances: AccountBalance[] = [];
  let priorYearName = "";

  if (selectedPeriod) {
    // ── 资产/负债/权益（永久性科目）：从公司成立起累计至期末 ──────────
    const bsLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: company.id,
          status: "POSTED",
          fiscalPeriod: { endDate: { lte: selectedPeriod.endDate } },
        },
        account: { accountType: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
      },
      include: { account: accountSelect },
    });

    // ── 收入/费用（临时性科目）：仅本财年，用于推算未结账的净利润 ──────
    const currentYearPeriodIds = periods
      .filter(
        (p) =>
          p.fiscalYear.id === selectedPeriod.fiscalYear.id &&
          p.periodNumber <= selectedPeriod.periodNumber
      )
      .map((p) => p.id);

    const plLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: company.id,
          status: "POSTED",
          fiscalPeriodId: { in: currentYearPeriodIds },
        },
        account: { accountType: { in: ["REVENUE", "EXPENSE"] } },
      },
      include: { account: accountSelect },
    });

    accountBalances = [
      ...aggregateLines(bsLines as RawLine[]),
      ...aggregateLines(plLines as RawLine[]),
    ];

    // ── 上年末余额（对比列，CAS 30）─────────────────────────────────
    const currentYear = selectedPeriod.fiscalYear.year;
    const priorYearDec = periods.find(
      (p) => p.fiscalYear.year === currentYear - 1 && p.periodNumber === 12
    );
    if (priorYearDec) {
      const priorYearAllPeriodIds = periods
        .filter((p) => p.fiscalYear.year === currentYear - 1)
        .map((p) => p.id);

      const [priorBsLines, priorPlLines] = await Promise.all([
        db.journalEntryLine.findMany({
          where: {
            journalEntry: {
              companyId: company.id,
              status: "POSTED",
              fiscalPeriod: { endDate: { lte: priorYearDec.endDate } },
            },
            account: { accountType: { in: ["ASSET", "LIABILITY", "EQUITY"] } },
          },
          include: { account: accountSelect },
        }),
        db.journalEntryLine.findMany({
          where: {
            journalEntry: {
              companyId: company.id,
              status: "POSTED",
              fiscalPeriodId: { in: priorYearAllPeriodIds },
            },
            account: { accountType: { in: ["REVENUE", "EXPENSE"] } },
          },
          include: { account: accountSelect },
        }),
      ]);

      priorYearBalances = [
        ...aggregateLines(priorBsLines as RawLine[]),
        ...aggregateLines(priorPlLines as RawLine[]),
      ];
      priorYearName = `${currentYear - 1}年末`;
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">资产负债表</h1>
        <p className="text-muted-foreground mt-1">
          反映企业在特定时点的财务状况（资产 = 负债 + 所有者权益）
        </p>
      </div>
      <BalanceSheetReport
        periods={periods.map((p) => ({
          id: p.id,
          name: p.name,
          year: p.fiscalYear.year,
          status: p.status,
        }))}
        selectedPeriodId={selectedPeriodId || ""}
        selectedPeriodName={selectedPeriod?.name || ""}
        accountBalances={accountBalances}
        priorYearBalances={priorYearBalances}
        priorYearName={priorYearName}
        companyName={company.name}
      />
    </div>
  );
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return parseFloat(d.toString());
}
