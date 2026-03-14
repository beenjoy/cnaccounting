import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { VendorActions } from "./vendor-actions";

const PAYMENT_LABELS: Record<string, string> = {
  NET_30: "Net 30天",
  NET_60: "Net 60天",
  NET_90: "Net 90天",
  IMMEDIATE: "即期",
  CUSTOM: "自定义",
};

export default async function VendorsPage() {
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

  const vendors = await db.vendor.findMany({
    where: { companyId: company.id, isActive: true },
    include: {
      _count: { select: { apInvoices: { where: { status: { in: ["OPEN", "PARTIAL", "OVERDUE"] } } } } },
    },
    orderBy: { code: "asc" },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">供应商档案</h1>
          <p className="text-muted-foreground mt-1">管理应付账款供应商信息</p>
        </div>
        {canEdit && <VendorActions companyId={company.id} mode="new" />}
      </div>

      {vendors.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="text-muted-foreground text-sm">暂无供应商档案</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">编码</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">供应商名称</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">税号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">联系人</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">付款条件</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">开户行</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">未结发票</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {vendors.map((v) => (
                <tr key={v.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{v.code}</td>
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.taxId ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.contactName ?? "—"}</td>
                  <td className="px-4 py-3">{PAYMENT_LABELS[v.paymentTerms] ?? v.paymentTerms}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.bankName ?? "—"}</td>
                  <td className="px-4 py-3 text-center">
                    {v._count.apInvoices > 0 ? (
                      <Link
                        href={`/ap/invoices?vendorId=${v.id}`}
                        className="inline-flex items-center justify-center rounded-full bg-amber-100 text-amber-700 text-xs px-2 py-0.5 hover:bg-amber-200"
                      >
                        {v._count.apInvoices} 张
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {canEdit && <VendorActions companyId={company.id} mode="edit" vendor={v} />}
                      {canDelete && <VendorActions companyId={company.id} mode="delete" vendor={v} />}
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
