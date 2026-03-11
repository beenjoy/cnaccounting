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

  // 获取所有会计期间（含年度信息）
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

  // ----------------------------------------------------------------
  // 资产负债表数据计算
  // 规则：汇总本财年内，截止所选期间（含）的所有已过账凭证
  // ----------------------------------------------------------------
  type AccountBalance = {
    accountId: string;
    accountCode: string;
    accountName: string;
    accountType: string;
    normalBalance: string;
    reportCategory: string | null;
    balance: number; // 正数 = 余额（资产/费用为借方净额，负债/权益/收入为贷方净额）
  };

  const accountBalances: AccountBalance[] = [];

  if (selectedPeriod) {
    // 取同一财年中，期间序号 <= 所选期间序号的所有期间 ID
    const periodIds = periods
      .filter(
        (p) =>
          p.fiscalYear.id === selectedPeriod.fiscalYear.id &&
          p.periodNumber <= selectedPeriod.periodNumber
      )
      .map((p) => p.id);

    // 查询这些期间的所有已过账凭证明细（关联科目含 reportCategory）
    const lines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: company.id,
          fiscalPeriodId: { in: periodIds },
          status: "POSTED",
        },
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

    // 按科目汇总借贷方金额
    const map = new Map<
      string,
      {
        accountId: string;
        code: string;
        name: string;
        type: string;
        normalBalance: string;
        reportCategory: string | null;
        totalDebit: number;
        totalCredit: number;
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

    // 计算余额（资产/费用：借方净额；负债/权益/收入：贷方净额）
    for (const acc of map.values()) {
      const balance =
        acc.normalBalance === "DEBIT"
          ? acc.totalDebit - acc.totalCredit
          : acc.totalCredit - acc.totalDebit;

      accountBalances.push({
        accountId: acc.accountId,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        normalBalance: acc.normalBalance,
        reportCategory: acc.reportCategory,
        balance,
      });
    }

    accountBalances.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
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
        companyName={company.name}
      />
    </div>
  );
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return parseFloat(d.toString());
}
