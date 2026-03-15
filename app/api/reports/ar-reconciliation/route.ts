/**
 * GET /api/reports/ar-reconciliation?companyId=xxx
 *
 * Returns AR sub-ledger vs GL account 1122 reconciliation summary.
 * Used as a data quality check to ensure AR invoices match the GL balance.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  // If no companyId, use the user's default company
  let resolvedCompanyId = companyId;
  if (!resolvedCompanyId) {
    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
      include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
    });
    resolvedCompanyId = membership?.organization.companies[0]?.id ?? null;
  }
  if (!resolvedCompanyId) return NextResponse.json({ error: "No company found" }, { status: 404 });

  // Verify user has access
  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organization: { companies: { some: { id: resolvedCompanyId } } },
    },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // AR sub-ledger total: sum of (totalAmount - paidAmount) for open/partial/overdue invoices
  const arSubLedger = await db.aRInvoice.aggregate({
    where: {
      companyId: resolvedCompanyId,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    _sum: { totalAmount: true, paidAmount: true },
  });
  const arTotal = parseFloat((arSubLedger._sum.totalAmount ?? 0).toString());
  const arPaid  = parseFloat((arSubLedger._sum.paidAmount  ?? 0).toString());
  const subLedgerBalance = arTotal - arPaid;

  // GL balance: account 1122 (应收账款) net debit balance
  const arAccount = await db.chartOfAccount.findFirst({
    where: { companyId: resolvedCompanyId, code: "1122" },
    select: { id: true, code: true, name: true },
  });

  let glBalance = 0;
  if (arAccount) {
    const glAgg = await db.journalEntryLine.aggregate({
      where: {
        accountId: arAccount.id,
        journalEntry: { companyId: resolvedCompanyId, status: "POSTED" },
      },
      _sum: { debitAmountLC: true, creditAmountLC: true },
    });
    const debit  = parseFloat((glAgg._sum.debitAmountLC  ?? 0).toString());
    const credit = parseFloat((glAgg._sum.creditAmountLC ?? 0).toString());
    glBalance = debit - credit;
  }

  const discrepancy = subLedgerBalance - glBalance;
  const isReconciled = Math.abs(discrepancy) < 0.01;

  return NextResponse.json({
    companyId: resolvedCompanyId,
    subLedgerBalance,
    glBalance,
    discrepancy,
    isReconciled,
    arAccount: arAccount ? { code: arAccount.code, name: arAccount.name } : null,
    message: isReconciled
      ? "AR 子账本与总账余额一致，无差异"
      : `AR 子账本与总账存在差异 ${discrepancy > 0 ? "（子账本多）" : "（总账多）"}：${Math.abs(discrepancy).toFixed(2)}`,
  });
}
