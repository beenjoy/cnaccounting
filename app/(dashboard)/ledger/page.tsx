import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

function fmt(n: number) {
  if (n === 0) return "";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}
function fmtBalance(n: number) {
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));
}
function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string; periodId?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { accountId, periodId } = await searchParams;

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  // 获取所有叶级科目（用于下拉）
  const accounts = await db.chartOfAccount.findMany({
    where: { companyId: company.id, isLeaf: true, isActive: true },
    orderBy: { code: "asc" },
  });

  // 获取所有期间（用于下拉）
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
  const selectedAccount = accounts.find((a) => a.id === accountId);

  // 计算数据
  type LedgerLine = {
    id: string;
    entryDate: Date;
    entryNumber: string;
    entryId: string;
    description: string;
    debit: number;
    credit: number;
    runningBalance: number;
    direction: string; // 借 / 贷
  };

  let openingBalance = 0;
  let lines: LedgerLine[] = [];
  let periodDebitTotal = 0;
  let periodCreditTotal = 0;

  if (accountId && selectedPeriod) {
    // 正常方向：ASSET/EXPENSE = DEBIT（余额为正表示借方余额）
    const isDebitNormal = selectedAccount
      ? ["ASSET", "EXPENSE"].includes(selectedAccount.accountType)
      : true;

    // 期初余额：所有 endDate < 当期 startDate 的已过账行
    const openingLines = await db.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          companyId: company.id,
          status: "POSTED",
          fiscalPeriod: { endDate: { lt: selectedPeriod.startDate } },
        },
      },
    });
    let openDebit = 0;
    let openCredit = 0;
    for (const l of openingLines) {
      openDebit += parseFloat(l.debitAmountLC.toString());
      openCredit += parseFloat(l.creditAmountLC.toString());
    }
    // 期初余额带符号（正=借方，负=贷方）
    openingBalance = isDebitNormal ? openDebit - openCredit : openCredit - openDebit;

    // 本期发生额
    const periodLines = await db.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: { companyId: company.id, status: "POSTED", fiscalPeriodId: selectedPeriodId },
      },
      include: {
        journalEntry: {
          select: { id: true, entryNumber: true, entryDate: true, description: true },
        },
      },
      orderBy: { journalEntry: { entryDate: "asc" } },
    });

    let running = openingBalance;
    for (const l of periodLines) {
      const debit = parseFloat(l.debitAmountLC.toString());
      const credit = parseFloat(l.creditAmountLC.toString());
      periodDebitTotal += debit;
      periodCreditTotal += credit;
      // 更新余额
      const change = isDebitNormal ? debit - credit : credit - debit;
      running += change;
      lines.push({
        id: l.id,
        entryDate: l.journalEntry.entryDate,
        entryNumber: l.journalEntry.entryNumber,
        entryId: l.journalEntry.id,
        description: l.description ?? l.journalEntry.description,
        debit,
        credit,
        runningBalance: running,
        direction: running >= 0 ? "借" : "贷",
      });
    }
  }

  const closingBalance = openingBalance + (periodDebitTotal - periodCreditTotal) *
    (selectedAccount && ["ASSET", "EXPENSE"].includes(selectedAccount.accountType) ? 1 : -1);

  const isDebitNormalForSelected = selectedAccount
    ? ["ASSET", "EXPENSE"].includes(selectedAccount.accountType)
    : true;
  const closingNet = isDebitNormalForSelected
    ? openingBalance + periodDebitTotal - periodCreditTotal
    : openingBalance + periodCreditTotal - periodDebitTotal;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">明细账</h1>
        <p className="text-muted-foreground mt-1">按科目查看每笔已过账凭证及余额变化</p>
      </div>

      {/* 筛选条 */}
      <form method="GET" action="/ledger" className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">科目：</span>
          <select
            name="accountId"
            defaultValue={accountId ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm min-w-52"
          >
            <option value="">— 请选择科目 —</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">期间：</span>
          <select
            name="periodId"
            defaultValue={selectedPeriodId ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-sm font-medium hover:bg-primary/90"
        >
          查询
        </button>
      </form>

      {!accountId ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground">请在上方选择科目和期间，然后点击「查询」查看明细账</p>
        </div>
      ) : (
        <>
          {/* 科目信息头 */}
          {selectedAccount && (
            <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
              <span className="font-mono font-medium">{selectedAccount.code}</span>
              <span className="font-semibold">{selectedAccount.name}</span>
              <Badge variant="secondary">{selectedAccount.accountType}</Badge>
              <Badge variant="outline">{selectedAccount.normalBalance === "DEBIT" ? "借方正常" : "贷方正常"}</Badge>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">日期</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">凭证号</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">摘要</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">借方</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">贷方</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">方向</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">余额</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* 期初余额行 */}
                <tr className="bg-blue-50/50 font-medium">
                  <td className="px-4 py-3 text-muted-foreground">期初</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-muted-foreground">期初余额</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-xs">
                    {openingBalance >= 0 ? "借" : "贷"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtBalance(openingBalance)}</td>
                </tr>

                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                      本期无发生额
                    </td>
                  </tr>
                ) : (
                  lines.map((line) => (
                    <tr key={line.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                        {fmtDate(line.entryDate)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/journals/${line.entryId}`}
                          className="font-mono text-primary hover:underline text-xs"
                        >
                          {line.entryNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate" title={line.description}>
                        {line.description}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {line.debit > 0 ? fmt(line.debit) : ""}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">
                        {line.credit > 0 ? fmt(line.credit) : ""}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                        {line.direction}
                      </td>
                      <td className="px-4 py-3 text-right font-mono">{fmtBalance(line.runningBalance)}</td>
                    </tr>
                  ))
                )}

                {/* 本期合计行 */}
                <tr className="bg-muted/30 font-medium border-t-2">
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-muted-foreground">本期合计</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(periodDebitTotal)}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(periodCreditTotal)}</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                </tr>

                {/* 期末余额行 */}
                <tr className="bg-green-50/50 font-semibold">
                  <td className="px-4 py-3 text-muted-foreground">期末</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-muted-foreground">期末余额</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right text-xs">
                    {closingNet >= 0 ? "借" : "贷"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtBalance(closingNet)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
