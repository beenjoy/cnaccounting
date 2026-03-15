/**
 * GET /api/reports/ap-reconciliation?companyId=xxx
 *
 * Returns AP sub-ledger vs GL account 2202 reconciliation summary.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  let resolvedCompanyId = companyId;
  if (!resolvedCompanyId) {
    const membership = await db.organizationMember.findFirst({
      where: { userId: session.user.id },
      include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
    });
    resolvedCompanyId = membership?.organization.companies[0]?.id ?? null;
  }
  if (!resolvedCompanyId) return NextResponse.json({ error: "No company found" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organization: { companies: { some: { id: resolvedCompanyId } } },
    },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // AP sub-ledger total
  const apSubLedger = await db.aPInvoice.aggregate({
    where: {
      companyId: resolvedCompanyId,
      status: { in: ["OPEN", "PARTIAL", "OVERDUE"] },
    },
    _sum: { totalAmount: true, paidAmount: true },
  });
  const apTotal = parseFloat((apSubLedger._sum.totalAmount ?? 0).toString());
  const apPaid  = parseFloat((apSubLedger._sum.paidAmount  ?? 0).toString());
  const subLedgerBalance = apTotal - apPaid;

  // GL balance: account 2202 (应付账款) net credit balance
  const apAccount = await db.chartOfAccount.findFirst({
    where: { companyId: resolvedCompanyId, code: "2202" },
    select: { id: true, code: true, name: true },
  });

  let glBalance = 0;
  if (apAccount) {
    const glAgg = await db.journalEntryLine.aggregate({
      where: {
        accountId: apAccount.id,
        journalEntry: { companyId: resolvedCompanyId, status: "POSTED" },
      },
      _sum: { debitAmountLC: true, creditAmountLC: true },
    });
    const debit  = parseFloat((glAgg._sum.debitAmountLC  ?? 0).toString());
    const credit = parseFloat((glAgg._sum.creditAmountLC ?? 0).toString());
    glBalance = credit - debit; // 负债贷方正常
  }

  const discrepancy = subLedgerBalance - glBalance;
  const isReconciled = Math.abs(discrepancy) < 0.01;

  return NextResponse.json({
    companyId: resolvedCompanyId,
    subLedgerBalance,
    glBalance,
    discrepancy,
    isReconciled,
    apAccount: apAccount ? { code: apAccount.code, name: apAccount.name } : null,
    message: isReconciled
      ? "AP 子账本与总账余额一致，无差异"
      : `AP 子账本与总账存在差异 ${discrepancy > 0 ? "（子账本多）" : "（总账多）"}：${Math.abs(discrepancy).toFixed(2)}`,
  });
}
