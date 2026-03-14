import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { APInvoiceActions } from "./ap-invoice-actions";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: "草稿",     cls: "bg-gray-100 text-gray-600" },
  OPEN:      { label: "待付款",   cls: "bg-blue-100 text-blue-700" },
  PARTIAL:   { label: "部分付款", cls: "bg-amber-100 text-amber-700" },
  PAID:      { label: "已付款",   cls: "bg-green-100 text-green-700" },
  OVERDUE:   { label: "逾期",     cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "已作废",   cls: "bg-gray-100 text-gray-400 line-through" },
};

function fmt(n: string | number) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function fmtDate(d: Date) {
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).format(d).replace(/\//g, "-");
}

export default async function APInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ vendorId?: string; status?: string }>;
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

  // 自动更新逾期状态
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  await db.aPInvoice.updateMany({
    where: {
      companyId: company.id,
      status: { in: ["OPEN", "PARTIAL"] },
      dueDate: { lt: today },
    },
    data: { status: "OVERDUE" },
  });

  const vendors = await db.vendor.findMany({
    where: { companyId: company.id, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  });

  const invoices = await db.aPInvoice.findMany({
    where: {
      companyId: company.id,
      ...(sp.vendorId ? { vendorId: sp.vendorId } : {}),
      ...(sp.status ? { status: sp.status as never } : { status: { not: "CANCELLED" } }),
    },
    include: { vendor: { select: { name: true, code: true } } },
    orderBy: { invoiceDate: "desc" },
  });

  const totalOpen = invoices
    .filter((i) => ["OPEN", "PARTIAL", "OVERDUE"].includes(i.status))
    .reduce((s, i) => s + parseFloat(i.totalAmount.toString()) - parseFloat(i.paidAmount.toString()), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">应付发票</h1>
          <p className="text-muted-foreground mt-1">
            管理采购发票与应付账款
            {totalOpen > 0 && (
              <span className="ml-2 text-amber-600 font-medium">待付款合计：¥{fmt(totalOpen)}</span>
            )}
          </p>
        </div>
        {canEdit && <APInvoiceActions companyId={company.id} vendors={vendors} mode="new" />}
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-3">
        <form method="GET" action="/ap/invoices" className="flex items-center gap-2">
          <select name="vendorId" defaultValue={sp.vendorId ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">全部供应商</option>
            {vendors.map((v) => (
              <option key={v.id} value={v.id}>{v.code} {v.name}</option>
            ))}
          </select>
          <select name="status" defaultValue={sp.status ?? ""}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm">
            <option value="">未作废</option>
            {Object.entries(STATUS_LABELS).map(([v, { label }]) => (
              <option key={v} value={v}>{label}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">筛选</button>
          {(sp.vendorId || sp.status) && (
            <Link href="/ap/invoices" className="text-sm text-muted-foreground hover:underline">清除</Link>
          )}
        </form>
      </div>

      {invoices.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">暂无发票记录</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">发票号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">供应商</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">开票日期</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">到期日</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">含税总额</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">已付款</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">未付款</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">状态</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoices.map((inv) => {
                const outstanding = parseFloat(inv.totalAmount.toString()) - parseFloat(inv.paidAmount.toString());
                const st = STATUS_LABELS[inv.status] ?? { label: inv.status, cls: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={inv.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground mr-1">{inv.vendor.code}</span>
                      {inv.vendor.name}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{fmtDate(inv.invoiceDate)}</td>
                    <td className={`px-4 py-3 text-center ${inv.status === "OVERDUE" ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      {fmtDate(inv.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(inv.totalAmount.toString())}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-700">{fmt(inv.paidAmount.toString())}</td>
                    <td className={`px-4 py-3 text-right font-mono font-medium ${outstanding > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                      {outstanding > 0 ? fmt(outstanding) : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canEdit && !["PAID", "CANCELLED"].includes(inv.status) && (
                        <APInvoiceActions companyId={company.id} vendors={vendors} mode="cancel" invoice={inv} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
