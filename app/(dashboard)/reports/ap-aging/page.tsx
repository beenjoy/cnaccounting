import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

const AGING_BUCKETS = [
  { label: "未到期",     min: null, max: 0   },
  { label: "1-30天",    min: 1,    max: 30  },
  { label: "31-60天",   min: 31,   max: 60  },
  { label: "61-90天",   min: 61,   max: 90  },
  { label: "91-180天",  min: 91,   max: 180 },
  { label: "181-365天", min: 181,  max: 365 },
  { label: "365天以上", min: 366,  max: null },
];

function fmt(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function getBucket(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0;
  for (let i = 1; i < AGING_BUCKETS.length; i++) {
    const { min, max } = AGING_BUCKETS[i];
    if (min !== null && max !== null && daysOverdue >= min && daysOverdue <= max) return i;
    if (min !== null && max === null && daysOverdue >= min) return i;
  }
  return AGING_BUCKETS.length - 1;
}

export default async function APAgingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const invoices = await db.aPInvoice.findMany({
    where: {
      companyId: company.id,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    include: { vendor: { select: { id: true, code: true, name: true } } },
    orderBy: [{ vendor: { code: "asc" } }, { dueDate: "asc" }],
  });

  type VendorRow = {
    vendorId: string;
    vendorCode: string;
    vendorName: string;
    buckets: number[];
    total: number;
  };

  const vendorMap = new Map<string, VendorRow>();

  for (const inv of invoices) {
    const outstanding = parseFloat(inv.totalAmount.toString()) - parseFloat(inv.paidAmount.toString());
    if (outstanding <= 0) continue;

    const dueDate = new Date(inv.dueDate);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
    const bucketIdx = getBucket(daysOverdue);

    const vid = inv.vendor.id;
    if (!vendorMap.has(vid)) {
      vendorMap.set(vid, {
        vendorId: vid,
        vendorCode: inv.vendor.code,
        vendorName: inv.vendor.name,
        buckets: new Array(AGING_BUCKETS.length).fill(0),
        total: 0,
      });
    }
    const row = vendorMap.get(vid)!;
    row.buckets[bucketIdx] += outstanding;
    row.total += outstanding;
  }

  const rows = Array.from(vendorMap.values()).sort((a, b) => a.vendorCode.localeCompare(b.vendorCode));

  const totals = new Array(AGING_BUCKETS.length).fill(0) as number[];
  let grandTotal = 0;
  for (const row of rows) {
    for (let i = 0; i < AGING_BUCKETS.length; i++) totals[i] += row.buckets[i];
    grandTotal += row.total;
  }

  // GL 核对：查 应付账款（2202）科目的已过账余额
  const apAccount = await db.chartOfAccount.findFirst({
    where: { companyId: company.id, code: "2202" },
  });
  let glBalance = 0;
  if (apAccount) {
    const glAgg = await db.journalEntryLine.aggregate({
      where: {
        accountId: apAccount.id,
        journalEntry: { companyId: company.id, status: "POSTED" },
      },
      _sum: { debitAmountLC: true, creditAmountLC: true },
    });
    const debit  = parseFloat((glAgg._sum.debitAmountLC  ?? 0).toString());
    const credit = parseFloat((glAgg._sum.creditAmountLC ?? 0).toString());
    glBalance = credit - debit; // 负债贷方正常余额
  }
  const discrepancy = grandTotal - glBalance;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">应付账款账龄分析</h1>
        <p className="text-muted-foreground mt-1">
          统计截至今日（{today.toLocaleDateString("zh-CN")}）各供应商应付余额按账龄的分布
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">暂无未结应付发票</p>
        </div>
      ) : (
        <>
          {/* 账龄明细表 */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">供应商</th>
                  {AGING_BUCKETS.map((b) => (
                    <th key={b.label} className="px-3 py-3 text-right font-medium text-muted-foreground whitespace-nowrap">
                      {b.label}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">合计</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr key={row.vendorId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground mr-2">{row.vendorCode}</span>
                      {row.vendorName}
                    </td>
                    {row.buckets.map((amount, i) => (
                      <td key={i} className={`px-3 py-3 text-right font-mono ${i > 0 && amount > 0 ? "text-orange-600" : "text-muted-foreground"}`}>
                        {fmt(amount)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(row.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-muted/30">
                <tr>
                  <td className="px-4 py-3 font-semibold">合计</td>
                  {totals.map((amount, i) => (
                    <td key={i} className={`px-3 py-3 text-right font-mono font-semibold ${i > 0 && amount > 0 ? "text-orange-600" : ""}`}>
                      {fmt(amount)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 子账本 vs 总账核对 */}
          <div className={`rounded-lg border p-4 text-sm ${Math.abs(discrepancy) < 0.01 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <h2 className={`font-semibold mb-3 ${Math.abs(discrepancy) < 0.01 ? "text-green-800" : "text-red-800"}`}>
              子账本与总账核对（2202 应付账款）
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-muted-foreground text-xs">AP 发票未结余额合计</p>
                <p className="font-mono font-semibold mt-0.5">{fmt(grandTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">总账 2202 应付账款余额</p>
                <p className="font-mono font-semibold mt-0.5">
                  {apAccount ? fmt(glBalance) : "（未找到科目）"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">差异</p>
                <p className={`font-mono font-semibold mt-0.5 ${Math.abs(discrepancy) < 0.01 ? "text-green-700" : "text-red-700"}`}>
                  {Math.abs(discrepancy) < 0.01 ? "✓ 无差异" : fmt(discrepancy)}
                </p>
              </div>
            </div>
            {Math.abs(discrepancy) >= 0.01 && (
              <p className="text-xs text-red-700 mt-3 border-t border-red-200 pt-2">
                ⚠ 子账本与总账存在差异。可能原因：有应付款凭证未通过 AP 发票模块录入，或存在直接调整总账的分录。请检查核实。
              </p>
            )}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        * 仅统计状态为「待付款」「部分付款」「逾期」的发票。已全额付款及已作废发票不计入。
      </p>
    </div>
  );
}
