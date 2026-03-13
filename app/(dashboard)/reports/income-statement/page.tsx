import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { IncomeStatementReport } from "./income-statement-report";

export default async function IncomeStatementPage({
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
    include: { fiscalYear: { select: { year: true, id: true } } },
    orderBy: [{ fiscalYear: { year: "desc" } }, { periodNumber: "desc" }],
  });

  // 默认当前月
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

  // ----------------------------------------------------------------
  // 利润表数据计算
  // 利润表只涉及收入（REVENUE）和费用（EXPENSE）类科目
  // 本期数：仅所选期间；本年累计数：财年起始至所选期间（含）
  // ----------------------------------------------------------------
  type AccountBalance = {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    reportCategory: string | null;
    currentPeriod: number; // 本期数（正=正常方向有金额）
    ytd: number;           // 本年累计数
  };

  const accountBalances: AccountBalance[] = [];

  if (selectedPeriod) {
    // 本年累计：同一财年内，期间序号 <= 所选期间的所有期间
    const ytdPeriodIds = periods
      .filter(
        (p) =>
          p.fiscalYear.id === selectedPeriod.fiscalYear.id &&
          p.periodNumber <= selectedPeriod.periodNumber
      )
      .map((p) => p.id);

    // 查询本年累计凭证明细（仅收入/费用科目）
    const ytdLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: company.id,
          fiscalPeriodId: { in: ytdPeriodIds },
          status: "POSTED",
        },
        account: { accountType: { in: ["REVENUE", "EXPENSE"] } },
      },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            accountType: true,
            normalBalance: true,
            reportCategory: true,
          },
        },
      },
    });

    // 查询本期凭证明细
    const currentLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: company.id,
          fiscalPeriodId: selectedPeriod.id,
          status: "POSTED",
        },
        account: { accountType: { in: ["REVENUE", "EXPENSE"] } },
      },
      include: {
        account: {
          select: {
            id: true,
            code: true,
            name: true,
            accountType: true,
            normalBalance: true,
            reportCategory: true,
          },
        },
      },
    });

    // 按科目汇总
    const map = new Map<
      string,
      {
        accountId: string;
        code: string;
        name: string;
        type: string;
        normalBalance: string;
        reportCategory: string | null;
        ytdDebit: number;
        ytdCredit: number;
        currDebit: number;
        currCredit: number;
      }
    >();

    const getOrCreate = (line: (typeof ytdLines)[0]) => {
      const key = line.accountId;
      if (!map.has(key)) {
        map.set(key, {
          accountId: key,
          code: line.account.code,
          name: line.account.name,
          type: line.account.accountType,
          normalBalance: line.account.normalBalance,
          reportCategory: line.account.reportCategory,
          ytdDebit: 0,
          ytdCredit: 0,
          currDebit: 0,
          currCredit: 0,
        });
      }
      return map.get(key)!;
    };

    for (const line of ytdLines) {
      const e = getOrCreate(line);
      e.ytdDebit += toNum(line.debitAmountLC);
      e.ytdCredit += toNum(line.creditAmountLC);
    }
    for (const line of currentLines) {
      const e = getOrCreate(line);
      e.currDebit += toNum(line.debitAmountLC);
      e.currCredit += toNum(line.creditAmountLC);
    }

    for (const acc of map.values()) {
      // 余额 = 正常方向净额（收入=贷方净额，费用=借方净额）
      const ytd =
        acc.normalBalance === "DEBIT"
          ? acc.ytdDebit - acc.ytdCredit
          : acc.ytdCredit - acc.ytdDebit;
      const current =
        acc.normalBalance === "DEBIT"
          ? acc.currDebit - acc.currCredit
          : acc.currCredit - acc.currDebit;

      accountBalances.push({
        accountId: acc.accountId,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        normalBalance: acc.normalBalance,
        reportCategory: acc.reportCategory,
        currentPeriod: current,
        ytd,
      });
    }

    accountBalances.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">利润表</h1>
        <p className="text-muted-foreground mt-1">
          反映企业在特定期间的经营成果（营业收入 - 成本费用 = 净利润）
        </p>
      </div>
      <IncomeStatementReport
        periods={periods.map((p) => ({
          id: p.id,
          name: p.name,
          year: p.fiscalYear.year,
          status: p.status,
        }))}
        selectedPeriodId={selectedPeriodId || ""}
        selectedPeriodName={selectedPeriod?.name || ""}
        accountBalances={accountBalances}
        companyName={company.name}
      />
    </div>
  );
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return parseFloat(d.toString());
}
