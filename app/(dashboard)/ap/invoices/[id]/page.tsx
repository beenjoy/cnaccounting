/**
 * AP 应付发票详情页
 * 展示发票完整信息、关联日记账凭证、核销记录
 * 提供"登记付款"功能：更新已付金额
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { APPaymentActions } from "./payment-actions";

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  DRAFT:     { label: "草稿",     cls: "bg-gray-100 text-gray-600" },
  OPEN:      { label: "待付款",   cls: "bg-blue-100 text-blue-700" },
  PARTIAL:   { label: "部分付款", cls: "bg-amber-100 text-amber-700" },
  PAID:      { label: "已付款",   cls: "bg-green-100 text-green-700" },
  OVERDUE:   { label: "逾期",     cls: "bg-red-100 text-red-700" },
  CANCELLED: { label: "已作废",   cls: "bg-gray-100 text-gray-400" },
};

function fmt(n: string | number | null | undefined) {
  if (n === null || n === undefined) return "—";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function fmtDate(d: Date | null | undefined) {
  if (!d) return "—";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).replace(/\//g, "-");
}

export default async function APInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true } } } } },
  });
  if (!membership) redirect("/onboarding");

  const companyIds = membership.organization.companies.map((c) => c.id);

  const invoice = await db.aPInvoice.findFirst({
    where: { id, companyId: { in: companyIds } },
    include: {
      vendor: true,
      matchings: {
        include: {
          journalEntryLine: {
            include: {
              journalEntry: {
                select: { entryNumber: true, entryDate: true, description: true, id: true },
              },
            },
          },
        },
        orderBy: { matchedDate: "asc" },
      },
    },
  });

  if (!invoice) notFound();

  const linkedJE = invoice.journalEntryId
    ? await db.journalEntry.findUnique({
        where: { id: invoice.journalEntryId },
        select: { id: true, entryNumber: true, entryDate: true, description: true, status: true },
      })
    : null;

  const canEdit = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role);
  const canRecord = canEdit && !["PAID", "CANCELLED"].includes(invoice.status);

  const totalAmount = Number(invoice.totalAmount);
  const paidAmount  = Number(invoice.paidAmount);
  const outstanding = totalAmount - paidAmount;
  const st = STATUS_LABELS[invoice.status] ?? { label: invoice.status, cls: "bg-gray-100 text-gray-600" };

  return (
    <div className="flex-1 space-y-6 p-6 max-w-4xl">
      {/* 面包屑 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/ap/invoices" className="hover:text-foreground">应付发票</Link>
        <span>/</span>
        <span className="text-foreground font-medium">{invoice.invoiceNumber}</span>
      </div>

      {/* 标题行 */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{invoice.invoiceNumber}</h1>
          <p className="text-muted-foreground mt-1">{invoice.vendor.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${st.cls}`}>
            {st.label}
          </span>
          {canRecord && (
            <APPaymentActions
              invoiceId={invoice.id}
              invoiceNumber={invoice.invoiceNumber}
              currency={invoice.currency}
              outstanding={outstanding}
            />
          )}
        </div>
      </div>

      {/* 发票基本信息 */}
      <div className="grid grid-cols-2 gap-6">
        <div className="rounded-lg border bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">发票信息</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">供应商</dt>
              <dd className="font-medium">{invoice.vendor.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">供应商税号</dt>
              <dd>{invoice.vendor.taxId ?? "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">开票日期</dt>
              <dd>{fmtDate(invoice.invoiceDate)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">到期日</dt>
              <dd className={invoice.status === "OVERDUE" ? "text-red-600 font-medium" : ""}>
                {fmtDate(invoice.dueDate)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">币种</dt>
              <dd>{invoice.currency}</dd>
            </div>
            {invoice.vendor.bankName && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">开户行</dt>
                <dd>{invoice.vendor.bankName}</dd>
              </div>
            )}
            {invoice.vendor.bankAccount && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">银行账号</dt>
                <dd className="font-mono text-xs">{invoice.vendor.bankAccount}</dd>
              </div>
            )}
            {invoice.description && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">摘要</dt>
                <dd className="text-right max-w-48">{invoice.description}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="rounded-lg border bg-white p-5 space-y-4">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">金额明细</h2>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">不含税金额</dt>
              <dd className="font-mono">{invoice.currency} {fmt(invoice.subtotal.toString())}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">税额</dt>
              <dd className="font-mono">{invoice.currency} {fmt(invoice.taxAmount.toString())}</dd>
            </div>
            <div className="flex justify-between border-t pt-3">
              <dt className="font-medium">含税总额</dt>
              <dd className="font-mono font-semibold text-base">{invoice.currency} {fmt(totalAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">已付款</dt>
              <dd className="font-mono text-green-700">{invoice.currency} {fmt(paidAmount)}</dd>
            </div>
            <div className="flex justify-between border-t pt-3">
              <dt className="font-medium">未付款</dt>
              <dd className={`font-mono font-semibold ${outstanding > 0 ? "text-amber-700" : "text-muted-foreground"}`}>
                {invoice.currency} {fmt(outstanding)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* 关联凭证 */}
      <div className="rounded-lg border bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">关联日记账凭证</h2>
        {linkedJE ? (
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{linkedJE.entryNumber}</span>
              <span>{fmtDate(linkedJE.entryDate)}</span>
              <span className="text-muted-foreground">{linkedJE.description}</span>
            </div>
            <Link href={`/journals/${linkedJE.id}`} className="text-primary hover:underline text-xs">
              查看凭证 →
            </Link>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            暂未关联日记账凭证。
            <span className="ml-1">
              （按会计准则，采购业务应同时编制入账凭证：借 库存商品/固定资产+应交税费，贷 应付账款）
            </span>
          </p>
        )}
      </div>

      {/* 核销记录 */}
      <div className="rounded-lg border bg-white p-5 space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          付款核销记录
          <span className="ml-2 text-xs font-normal text-muted-foreground normal-case">
            （共 {invoice.matchings.length} 笔，合计已付 {invoice.currency} {fmt(paidAmount)}）
          </span>
        </h2>
        {invoice.matchings.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">暂无付款记录</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2 text-left font-medium text-muted-foreground">核销日期</th>
                <th className="py-2 text-left font-medium text-muted-foreground">关联凭证</th>
                <th className="py-2 text-left font-medium text-muted-foreground">摘要</th>
                <th className="py-2 text-right font-medium text-muted-foreground">核销金额</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {invoice.matchings.map((m) => (
                <tr key={m.id} className="hover:bg-muted/20">
                  <td className="py-2 text-muted-foreground">{fmtDate(m.matchedDate)}</td>
                  <td className="py-2">
                    <Link
                      href={`/journals/${m.journalEntryLine.journalEntry.id}`}
                      className="font-mono text-xs text-primary hover:underline"
                    >
                      {m.journalEntryLine.journalEntry.entryNumber}
                    </Link>
                  </td>
                  <td className="py-2 text-muted-foreground text-xs">
                    {m.journalEntryLine.journalEntry.description}
                  </td>
                  <td className="py-2 text-right font-mono text-green-700">
                    {invoice.currency} {fmt(m.matchedAmount.toString())}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 会计说明 */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-xs text-blue-800">
        <strong>与日记账凭证的勾稽关系说明：</strong><br />
        ①采购时：应同时创建凭证（借：库存商品/原材料+应交税费，贷：应付账款），并关联本发票；<br />
        ②付款时：创建付款凭证（借：应付账款，贷：银行存款），然后在此页面登记付款以核销发票；<br />
        ③完全核销后：发票状态自动更新为「已付款」，应付账款余额清零。
      </div>
    </div>
  );
}
