import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Decimal } from "@prisma/client/runtime/library";
import { CashFlowReport } from "./cash-flow-report";
import { IndirectCashFlowReport } from "./indirect-method";

// 现金及现金等价物科目编码前缀（1001 库存现金，1002 银行存款）
const CASH_ACCOUNT_CODES = ["1001", "1002"];

function isCashAccount(code: string) {
  return CASH_ACCOUNT_CODES.some((prefix) => code === prefix || code.startsWith(prefix + "."));
}

// 根据对方科目自动推断现金流分类
function inferActivity(
  counterparts: { accountType: string; reportCategory: string | null }[]
): "OPERATING" | "INVESTING" | "FINANCING" {
  for (const c of counterparts) {
    if (c.accountType === "REVENUE") return "OPERATING";
    if (c.accountType === "EXPENSE") return "OPERATING";
    if (c.reportCategory === "NON_CURRENT_ASSET") return "INVESTING";
    if (c.accountType === "LIABILITY") return "FINANCING";
    if (c.accountType === "EQUITY") return "FINANCING";
  }
  return "OPERATING";
}

export type CashFlowItem = {
  entryId: string;
  entryNumber: string;
  entryDescription: string;
  cashAccountCode: string;
  cashAccountName: string;
  counterpartSummary: string;
  activity: "OPERATING" | "INVESTING" | "FINANCING";
  isAutoClassified: boolean;
  amount: number;        // 正 = 流入，负 = 流出
  periodId: string;
};

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; method?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { periodId, method } = await searchParams;
  const isIndirect = method === "indirect";

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: { companies: { where: { isActive: true }, take: 1 } },
      },
    },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    include: { fiscalYear: { select: { year: true, id: true } } },
    orderBy: [{ fiscalYear: { year: "desc" } }, { periodNumber: "desc" } ],
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

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  // ----------------------------------------------------------------
  // 期初现金余额：财年开始前所有年份的现金科目余额
  // ----------------------------------------------------------------
  let openingBalance = 0;
  const cashFlowItems: CashFlowItem[] = [];

  if (selectedPeriod) {
    const fiscalYearId = selectedPeriod.fiscalYear.id;

    // 取财年内所有期间（按序号排序）
    const allFiscalYearPeriods = periods
      .filter((p) => p.fiscalYear.id === fiscalYearId)
      .sort((a, b) => a.periodNumber - b.periodNumber);

    // 期初余额：本财年之前所有已过账凭证对现金科目的净影响
    const previousFiscalYearPeriodIds = periods
      .filter((p) => p.fiscalYear.id !== fiscalYearId)
      .map((p) => p.id);

    if (previousFiscalYearPeriodIds.length > 0) {
      const priorLines = await db.journalEntryLine.findMany({
        where: {
          journalEntry: {
            companyId: company.id,
            fiscalPeriodId: { in: previousFiscalYearPeriodIds },
            status: "POSTED",
          },
          account: { code: { in: CASH_ACCOUNT_CODES } },
        },
        select: { debitAmountLC: true, creditAmountLC: true },
      });
      for (const l of priorLines) {
        openingBalance += toNum(l.debitAmountLC) - toNum(l.creditAmountLC);
      }
    }

    // YTD 期间：本财年内，序号 <= 所选期间序号的所有期间
    const ytdPeriodIds = allFiscalYearPeriods
      .filter((p) => p.periodNumber <= selectedPeriod.periodNumber)
      .map((p) => p.id);

    // 查询 YTD 所有已过账凭证（含完整行）
    const entries = await db.journalEntry.findMany({
      where: {
        companyId: company.id,
        fiscalPeriodId: { in: ytdPeriodIds },
        status: "POSTED",
      },
      select: {
        id: true,
        entryNumber: true,
        description: true,
        fiscalPeriodId: true,
        lines: {
          select: {
            id: true,
            cashFlowActivity: true,
            debitAmountLC: true,
            creditAmountLC: true,
            account: {
              select: {
                code: true,
                name: true,
                accountType: true,
                reportCategory: true,
              },
            },
          },
        },
      },
    });

    // 处理每个凭证
    for (const entry of entries) {
      const cashLines = entry.lines.filter((l) => isCashAccount(l.account.code));
      if (cashLines.length === 0) continue;

      const nonCashLines = entry.lines.filter((l) => !isCashAccount(l.account.code));

      for (const cashLine of cashLines) {
        const inflow  = toNum(cashLine.debitAmountLC);
        const outflow = toNum(cashLine.creditAmountLC);
        if (inflow === 0 && outflow === 0) continue;

        const amount = inflow - outflow; // 正=流入，负=流出

        let activity: "OPERATING" | "INVESTING" | "FINANCING";
        let isAutoClassified: boolean;

        if (cashLine.cashFlowActivity) {
          activity = cashLine.cashFlowActivity;
          isAutoClassified = false;
        } else {
          activity = inferActivity(
            nonCashLines.map((l) => ({
              accountType: l.account.accountType,
              reportCategory: l.account.reportCategory,
            }))
          );
          isAutoClassified = true;
        }

        const counterpartSummary = nonCashLines
          .map((l) => l.account.name)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join("、");

        cashFlowItems.push({
          entryId: entry.id,
          entryNumber: entry.entryNumber,
          entryDescription: entry.description ?? "",
          cashAccountCode: cashLine.account.code,
          cashAccountName: cashLine.account.name,
          counterpartSummary,
          activity,
          isAutoClassified,
          amount,
          periodId: entry.fiscalPeriodId,
        });
      }
    }

    // ── 间接法渲染 ────────────────────────────────────────────────────────
    if (isIndirect) {
      return (
        <div className="space-y-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">现金流量表</h1>
              <p className="text-muted-foreground mt-1">反映企业在特定期间现金及现金等价物的流入和流出</p>
            </div>
          </div>

          {/* 方法切换 + 期间选择器 */}
          <div className="flex flex-wrap items-end gap-4">
            <form method="GET" className="flex items-end gap-3 bg-white border rounded-lg p-4">
              <input type="hidden" name="method" value="indirect" />
              <div>
                <label className="block text-xs font-medium mb-1">会计期间</label>
                <select
                  name="periodId"
                  defaultValue={selectedPeriodId}
                  className="rounded-md border px-3 py-1.5 text-sm min-w-48"
                >
                  {periods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">
                查询
              </button>
            </form>

            <div className="flex rounded-lg border overflow-hidden text-sm">
              <a
                href={`?periodId=${selectedPeriodId}&method=direct`}
                className="px-4 py-2 text-muted-foreground hover:bg-muted/50"
              >
                直接法
              </a>
              <a
                href={`?periodId=${selectedPeriodId}&method=indirect`}
                className="px-4 py-2 bg-primary text-primary-foreground font-medium"
              >
                间接法
              </a>
            </div>
          </div>

          <IndirectCashFlowReport
            companyId={company.id}
            companyName={company.name}
            selectedPeriodName={selectedPeriod.name}
            selectedPeriodNumber={selectedPeriod.periodNumber}
            ytdPeriodIds={ytdPeriodIds}
            priorPeriodIds={previousFiscalYearPeriodIds}
            cashFlowItems={cashFlowItems}
            openingBalance={openingBalance}
          />
        </div>
      );
    }
  }

  // ── 直接法渲染 ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">现金流量表</h1>
        <p className="text-muted-foreground mt-1">
          反映企业在特定期间现金及现金等价物的流入和流出（直接法）
        </p>
      </div>
      <CashFlowReport
        periods={periods.map((p) => ({
          id: p.id,
          name: p.name,
          year: p.fiscalYear.year,
          status: p.status,
        }))}
        selectedPeriodId={selectedPeriodId || ""}
        selectedPeriodName={selectedPeriod?.name || ""}
        selectedPeriodNumber={selectedPeriod?.periodNumber ?? 0}
        cashFlowItems={cashFlowItems}
        openingBalance={openingBalance}
        companyName={company.name}
        currentMethod="direct"
      />
    </div>
  );
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return parseFloat(d.toString());
}
