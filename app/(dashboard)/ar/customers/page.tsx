import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { CustomerActions } from "./customer-actions";

const PAYMENT_LABELS: Record<string, string> = {
  NET_30: "Net 30天",
  NET_60: "Net 60天",
  NET_90: "Net 90天",
  IMMEDIATE: "即期",
  CUSTOM: "自定义",
};

function fmt(n: number | string) {
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (num === 0) return "—";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

export default async function CustomersPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  const canEdit = membership && ["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role);
  const canDelete = membership && ["OWNER", "ADMIN"].includes(membership.role);

  const customers = await db.customer.findMany({
    where: { companyId: company.id, isActive: true },
    include: {
      _count: { select: { arInvoices: { where: { status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } } } } },
    },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">客户档案</h1>
          <p className="text-muted-foreground mt-1">管理应收账款客户信息</p>
        </div>
        {canEdit && (
          <CustomerActions companyId={company.id} mode="new" />
        )}
      </div>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">暂无客户档案</p>
          {canEdit && (
            <p className="text-xs text-muted-foreground mt-2">点击右上角「新建客户」开始录入</p>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">编码</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">客户名称</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">税号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">联系人</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">付款条件</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">信用额度</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">未结发票</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{c.code}</td>
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.taxId ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.contactName ?? "—"}</td>
                  <td className="px-4 py-3">{PAYMENT_LABELS[c.paymentTerms] ?? c.paymentTerms}</td>
                  <td className="px-4 py-3 text-right font-mono">{fmt(c.creditLimit.toString())}</td>
                  <td className="px-4 py-3 text-center">
                    {c._count.arInvoices > 0 ? (
                      <Link
                        href={`/ar/invoices?customerId=${c.id}`}
                        className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 hover:bg-amber-200"
                      >
                        {c._count.arInvoices} 张
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {canEdit && (
                        <CustomerActions companyId={company.id} mode="edit" customer={{ ...c, creditLimit: Number(c.creditLimit) }} />
                      )}
                      {canDelete && (
                        <CustomerActions companyId={company.id} mode="delete" customer={{ ...c, creditLimit: Number(c.creditLimit) }} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
