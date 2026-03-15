import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

// 账龄区间定义（天数）
const AGING_BUCKETS = [
  { label: "未到期",     min: null,  max: 0,    provisionRate: 0.00 },
  { label: "1-30天",    min: 1,     max: 30,   provisionRate: 0.05 },
  { label: "31-60天",   min: 31,    max: 60,   provisionRate: 0.10 },
  { label: "61-90天",   min: 61,    max: 90,   provisionRate: 0.20 },
  { label: "91-180天",  min: 91,    max: 180,  provisionRate: 0.50 },
  { label: "181-365天", min: 181,   max: 365,  provisionRate: 0.80 },
  { label: "365天以上", min: 366,   max: null, provisionRate: 1.00 },
];

function fmt(n: number) {
  if (n === 0) return "—";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(r: number) {
  return (r * 100).toFixed(0) + "%";
}

function getBucket(daysOverdue: number): number {
  if (daysOverdue <= 0) return 0; // 未到期
  for (let i = 1; i < AGING_BUCKETS.length; i++) {
    const { min, max } = AGING_BUCKETS[i];
    if (min !== null && max !== null && daysOverdue >= min && daysOverdue <= max) return i;
    if (min !== null && max === null && daysOverdue >= min) return i;
  }
  return AGING_BUCKETS.length - 1;
}

export default async function ARAgingPage() {
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

  // 查所有未全额核销的发票
  const invoices = await db.aRInvoice.findMany({
    where: {
      companyId: company.id,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    include: { customer: { select: { id: true, code: true, name: true } } },
    orderBy: [{ customer: { code: "asc" } }, { dueDate: "asc" }],
  });

  // 按客户分组 + 计算账龄
  type CustomerRow = {
    customerId: string;
    customerCode: string;
    customerName: string;
    buckets: number[]; // AGING_BUCKETS.length 个数值
    total: number;
  };

  const customerMap = new Map<string, CustomerRow>();

  for (const inv of invoices) {
    const outstanding = parseFloat(inv.totalAmount.toString()) - parseFloat(inv.paidAmount.toString());
    if (outstanding <= 0) continue;

    const dueDate = new Date(inv.dueDate);
    const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / 86400000);
    const bucketIdx = getBucket(daysOverdue);

    const cid = inv.customer.id;
    if (!customerMap.has(cid)) {
      customerMap.set(cid, {
        customerId: cid,
        customerCode: inv.customer.code,
        customerName: inv.customer.name,
        buckets: new Array(AGING_BUCKETS.length).fill(0),
        total: 0,
      });
    }
    const row = customerMap.get(cid)!;
    row.buckets[bucketIdx] += outstanding;
    row.total += outstanding;
  }

  const rows = Array.from(customerMap.values()).sort((a, b) => a.customerCode.localeCompare(b.customerCode));

  // 列合计
  const totals = new Array(AGING_BUCKETS.length).fill(0) as number[];
  let grandTotal = 0;
  for (const row of rows) {
    for (let i = 0; i < AGING_BUCKETS.length; i++) totals[i] += row.buckets[i];
    grandTotal += row.total;
  }

  // 坏账准备测算（按账龄区间 × 计提比例）
  const provisionByBucket = AGING_BUCKETS.map((b, i) => ({
    label: b.label,
    rate: b.provisionRate,
    amount: totals[i],
    provision: totals[i] * b.provisionRate,
  }));
  const totalProvision = provisionByBucket.reduce((s, b) => s + b.provision, 0);

  // GL 核对：查 应收账款（1122）科目的已过账余额
  const arAccount = await db.chartOfAccount.findFirst({
    where: { companyId: company.id, code: "1122" },
  });
  let glBalance = 0;
  if (arAccount) {
    const glAgg = await db.journalEntryLine.aggregate({
      where: {
        accountId: arAccount.id,
        journalEntry: { companyId: company.id, status: "POSTED" },
      },
      _sum: { debitAmountLC: true, creditAmountLC: true },
    });
    const debit  = parseFloat((glAgg._sum.debitAmountLC  ?? 0).toString());
    const credit = parseFloat((glAgg._sum.creditAmountLC ?? 0).toString());
    glBalance = debit - credit; // 资产借方正常余额
  }
  const discrepancy = grandTotal - glBalance;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">应收账款账龄分析</h1>
        <p className="text-muted-foreground mt-1">
          统计截至今日（{today.toLocaleDateString("zh-CN")}）各客户应收余额按账龄的分布
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">暂无未结应收发票</p>
        </div>
      ) : (
        <>
          {/* 账龄明细表 */}
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">客户</th>
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
                  <tr key={row.customerId} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-xs text-muted-foreground mr-2">{row.customerCode}</span>
                      {row.customerName}
                    </td>
                    {row.buckets.map((amount, i) => (
                      <td key={i} className={`px-3 py-3 text-right font-mono ${i > 0 && amount > 0 ? "text-red-600" : "text-muted-foreground"}`}>
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
                    <td key={i} className={`px-3 py-3 text-right font-mono font-semibold ${i > 0 && amount > 0 ? "text-red-600" : ""}`}>
                      {fmt(amount)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right font-mono font-semibold">{fmt(grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 坏账准备测算 */}
          <div className="rounded-lg border bg-white overflow-hidden">
            <div className="px-4 py-3 border-b bg-amber-50">
              <h2 className="font-semibold text-sm text-amber-900">坏账准备测算</h2>
              <p className="text-xs text-amber-700 mt-0.5">
                按账龄区间适用计提比例自动推算应计提金额（参考标准，以企业实际会计政策为准）
              </p>
            </div>
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/20">
                <tr>
                  <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">账龄区间</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">余额</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">计提比例</th>
                  <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">应计提坏账准备</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {provisionByBucket.map((b, i) => (
                  <tr key={i} className={b.provision > 0 ? "bg-red-50/40" : ""}>
                    <td className="px-4 py-2">{b.label}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(b.amount)}</td>
                    <td className={`px-4 py-2 text-right font-mono ${b.rate > 0 ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      {fmtPct(b.rate)}
                    </td>
                    <td className={`px-4 py-2 text-right font-mono ${b.provision > 0 ? "text-red-600 font-semibold" : "text-muted-foreground"}`}>
                      {fmt(b.provision)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 bg-amber-50/60">
                <tr className="font-semibold">
                  <td className="px-4 py-3">合计应计提坏账准备</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(grandTotal)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">
                    综合 {grandTotal > 0 ? fmtPct(totalProvision / grandTotal) : "0%"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-red-700">{fmt(totalProvision)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 子账本 vs 总账核对 */}
          <div className={`rounded-lg border p-4 text-sm ${Math.abs(discrepancy) < 0.01 ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
            <h2 className={`font-semibold mb-3 ${Math.abs(discrepancy) < 0.01 ? "text-green-800" : "text-red-800"}`}>
              子账本与总账核对（1122 应收账款）
            </h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-muted-foreground text-xs">AR 发票未结余额合计</p>
                <p className="font-mono font-semibold mt-0.5">{fmt(grandTotal)}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-xs">总账 1122 应收账款余额</p>
                <p className="font-mono font-semibold mt-0.5">
                  {arAccount ? fmt(glBalance) : "（未找到科目）"}
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
                ⚠ 子账本与总账存在差异。可能原因：有应收款凭证未通过 AR 发票模块录入，或存在直接调整总账的分录。请检查核实。
              </p>
            )}
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">
        * 仅统计状态为「待收款」「部分收款」「逾期」的发票。已全额收款及已作废发票不计入。坏账准备计提比例仅供参考，以企业实际会计政策为准。
      </p>
    </div>
  );
}
