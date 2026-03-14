import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { VATRecordActions } from "./vat-record-actions";

const DIRECTION_LABELS: Record<string, string> = {
  SALES: "销项",
  PURCHASE: "进项",
};

const INVOICE_TYPE_LABELS: Record<string, string> = {
  SPECIAL_VAT:    "增值税专用发票",
  GENERAL_VAT:    "增值税普通发票",
  ELECTRONIC_VAT: "电子普通发票",
  TOLL_ROAD:      "通行费发票",
  OTHER:          "其他",
};

function fmt(n: string | number) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/\//g, "-");
}

export default async function VATRecordsPage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string; direction?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sp = await searchParams;

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  const canEdit = membership && ["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role);

  // 获取所有期间（用于筛选下拉）
  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    include: { fiscalYear: { select: { year: true } } },
    orderBy: [{ fiscalYear: { year: "desc" } }, { periodNumber: "desc" }],
  });

  // 查增值税记录
  const records = await db.vATRecord.findMany({
    where: {
      companyId: company.id,
      ...(sp.periodId ? { fiscalPeriodId: sp.periodId } : {}),
      ...(sp.direction ? { direction: sp.direction as "SALES" | "PURCHASE" } : {}),
    },
    orderBy: { invoiceDate: "desc" },
  });

  // 分方向汇总
  const salesTotal = records
    .filter((r) => r.direction === "SALES")
    .reduce((s, r) => ({ amount: s.amount + parseFloat(r.amount.toString()), tax: s.tax + parseFloat(r.taxAmount.toString()) }), { amount: 0, tax: 0 });

  const purchaseDeductible = records
    .filter((r) => r.direction === "PURCHASE" && r.deductible)
    .reduce((s, r) => ({ amount: s.amount + parseFloat(r.amount.toString()), tax: s.tax + parseFloat(r.taxAmount.toString()) }), { amount: 0, tax: 0 });

  const purchaseNonDeductible = records
    .filter((r) => r.direction === "PURCHASE" && !r.deductible)
    .reduce((s, r) => ({ amount: s.amount + parseFloat(r.amount.toString()), tax: s.tax + parseFloat(r.taxAmount.toString()) }), { amount: 0, tax: 0 });

  const netVAT = salesTotal.tax - purchaseDeductible.tax; // 应缴 or 留抵

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">进销项台账</h1>
          <p className="text-muted-foreground mt-1">记录增值税进项与销项发票</p>
        </div>
        {canEdit && (
          <VATRecordActions companyId={company.id} periods={periods} />
        )}
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">销项税额</p>
          <p className="text-lg font-bold text-blue-700">¥{fmt(salesTotal.tax)}</p>
          <p className="text-xs text-muted-foreground mt-1">不含税：¥{fmt(salesTotal.amount)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">可抵扣进项税额</p>
          <p className="text-lg font-bold text-green-700">¥{fmt(purchaseDeductible.tax)}</p>
          <p className="text-xs text-muted-foreground mt-1">不含税：¥{fmt(purchaseDeductible.amount)}</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs text-muted-foreground mb-1">不可抵扣进项税额</p>
          <p className="text-lg font-bold text-gray-500">¥{fmt(purchaseNonDeductible.tax)}</p>
          <p className="text-xs text-muted-foreground mt-1">不含税：¥{fmt(purchaseNonDeductible.amount)}</p>
        </div>
        <div className={`rounded-lg border p-4 ${netVAT >= 0 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
          <p className="text-xs text-muted-foreground mb-1">{netVAT >= 0 ? "应缴增值税" : "留抵税额"}</p>
          <p className={`text-lg font-bold ${netVAT >= 0 ? "text-red-700" : "text-green-700"}`}>
            ¥{fmt(Math.abs(netVAT))}
          </p>
          <p className="text-xs text-muted-foreground mt-1">销项 − 可抵进项</p>
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-3">
        <form method="GET" action="/vat/records" className="flex items-center gap-2">
          <select name="periodId" defaultValue={sp.periodId ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">全部期间</option>
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <select name="direction" defaultValue={sp.direction ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">进项+销项</option>
            <option value="SALES">仅销项</option>
            <option value="PURCHASE">仅进项</option>
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">筛选</button>
          {(sp.periodId || sp.direction) && (
            <Link href="/vat/records" className="text-sm text-muted-foreground hover:underline">清除</Link>
          )}
        </form>
      </div>

      {/* 台账表格 */}
      {records.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">暂无增值税记录</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">方向</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">发票号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">发票类型</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">开票日期</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">对方名称</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">税率</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">不含税金额</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">税额</th>
                <th className="px-3 py-3 text-center font-medium text-muted-foreground">可抵扣</th>
                {canEdit && <th className="px-3 py-3 text-center font-medium text-muted-foreground">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-3 py-3 text-center">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                      r.direction === "SALES"
                        ? "bg-blue-100 text-blue-700"
                        : "bg-green-100 text-green-700"
                    }`}>
                      {DIRECTION_LABELS[r.direction]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{r.invoiceNumber}</td>
                  <td className="px-4 py-3 text-muted-foreground">{INVOICE_TYPE_LABELS[r.invoiceType] ?? r.invoiceType}</td>
                  <td className="px-3 py-3 text-center text-muted-foreground">{fmtDate(r.invoiceDate)}</td>
                  <td className="px-4 py-3">{r.counterparty}</td>
                  <td className="px-3 py-3 text-center font-mono">{(parseFloat(r.taxRate.toString()) * 100).toFixed(0)}%</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(r.amount.toString())}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{fmt(r.taxAmount.toString())}</td>
                  <td className="px-3 py-3 text-center">
                    {r.direction === "PURCHASE" ? (
                      r.deductible
                        ? <span className="text-green-600 text-xs">✓</span>
                        : <span className="text-gray-400 text-xs">✗</span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-3 text-center">
                      <VATRecordActions companyId={company.id} periods={periods} mode="delete" recordId={r.id} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        * 应缴增值税 = 销项税额 − 可抵扣进项税额。若为负数则为留抵税额，可结转下期。
      </p>
    </div>
  );
}
