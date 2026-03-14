import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/vat-declaration
// Generates a VAT closing journal entry for the selected period
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json() as {
    companyId: string;
    fiscalPeriodId: string;
  };
  const { companyId, fiscalPeriodId } = body;

  if (!companyId || !fiscalPeriodId) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  // Verify membership (OWNER/ADMIN/ACCOUNTANT only)
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { id: true, organizationId: true, name: true, surtaxConfig: true },
  });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const member = await db.organizationMember.findFirst({
    where: { organizationId: company.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  // Load the fiscal period
  const period = await db.fiscalPeriod.findUnique({
    where: { id: fiscalPeriodId },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });
  if (!period) return NextResponse.json({ error: "期间不存在" }, { status: 404 });
  if (period.status === "CLOSED") {
    return NextResponse.json({ error: "该期间已关闭，无法生成结转凭证" }, { status: 400 });
  }

  // Aggregate VAT records for this period
  const vatRecords = await db.vATRecord.findMany({
    where: { companyId, fiscalPeriodId },
    select: { direction: true, taxAmount: true, deductible: true },
  });

  const salesTax = vatRecords
    .filter((r) => r.direction === "SALES")
    .reduce((s, r) => s + Number(r.taxAmount), 0);

  const deductiblePurchaseTax = vatRecords
    .filter((r) => r.direction === "PURCHASE" && r.deductible)
    .reduce((s, r) => s + Number(r.taxAmount), 0);

  const nonDeductiblePurchaseTax = vatRecords
    .filter((r) => r.direction === "PURCHASE" && !r.deductible)
    .reduce((s, r) => s + Number(r.taxAmount), 0);

  const vatPayable = salesTax - deductiblePurchaseTax; // positive = 应缴, negative = 留抵

  if (salesTax === 0 && deductiblePurchaseTax === 0) {
    return NextResponse.json({ error: "本期无增值税记录，无需生成结转凭证" }, { status: 400 });
  }

  // Find required accounts by code
  // 2221 应交税费（通用账户，fallback to 2221x if exists）
  const findAccount = async (code: string) => {
    return db.chartOfAccount.findFirst({
      where: { companyId, code, isActive: true },
      select: { id: true, name: true, code: true },
    });
  };

  const vatAccount = await findAccount("2221");
  if (!vatAccount) {
    return NextResponse.json({ error: "未找到应交税费科目（2221），请先完善科目表" }, { status: 400 });
  }

  // Get surtax config from company
  type SurtaxConfig = { urbanMaintenance?: number; educationSurcharge?: number; localEducation?: number };
  const surtaxConfig = (company.surtaxConfig as SurtaxConfig) ?? {};
  const urbanRate = surtaxConfig.urbanMaintenance ?? 0.07;
  const eduRate = surtaxConfig.educationSurcharge ?? 0.03;
  const localEduRate = surtaxConfig.localEducation ?? 0.02;

  // Surtax is only applied when there's a positive VAT payable
  const urbanTax = vatPayable > 0 ? +(vatPayable * urbanRate).toFixed(2) : 0;
  const eduTax = vatPayable > 0 ? +(vatPayable * eduRate).toFixed(2) : 0;
  const localEduTax = vatPayable > 0 ? +(vatPayable * localEduRate).toFixed(2) : 0;
  const totalSurtax = urbanTax + eduTax + localEduTax;

  // Find tax expense account (6403 税金及附加) and surtax payable accounts
  // We'll use 2221 as the VAT payable account
  // For surtax: 6403 税金及附加, 2221 应交税费 (same parent — simplified)
  const taxExpenseAccount = await findAccount("6403");
  // If 6403 doesn't exist, we'll skip surtax entries

  // Generate next journal entry number
  const year = period.startDate.getFullYear();
  const lastEntry = await db.journalEntry.findFirst({
    where: { companyId, entryNumber: { startsWith: `JE-${year}-` } },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  let nextSeq = 1;
  if (lastEntry) {
    const parts = lastEntry.entryNumber.split("-");
    nextSeq = parseInt(parts[2] ?? "0", 10) + 1;
  }
  const entryNumber = `JE-${year}-${String(nextSeq).padStart(5, "0")}`;

  // Build journal entry lines
  // VAT transfer entry:
  //   If vatPayable > 0 (应缴):
  //     Dr 应交税费-应交增值税（销项）  salesTax
  //     Cr 应交税费-应交增值税（进项）  deductiblePurchaseTax
  //     Cr 应交税费-应交增值税（未交）  vatPayable
  //   If vatPayable <= 0 (留抵):
  //     Dr 应交税费-应交增值税（销项）  salesTax
  //     Cr 应交税费-应交增值税（进项）  salesTax  (= deductiblePurchaseTax - excess, balanced)
  //     Actually: Dr salesTax, Cr deductiblePurchaseTax—balance means Cr > Dr, which is a debit balance carry-forward
  //
  // Simplified approach: always Dr salesTax / Cr deductiblePurchaseTax with net going to payable
  // We use the same account (2221) for all since we don't have sub-accounts set up yet.

  type LineInput = {
    accountId: string;
    description: string;
    debit: number;
    credit: number;
    currency: string;
    exchangeRate: number;
  };

  const lines: LineInput[] = [];
  const entryDate = period.endDate; // end of period

  if (salesTax > 0) {
    lines.push({
      accountId: vatAccount.id,
      description: `增值税结转-销项税额（${period.name}）`,
      debit: +salesTax.toFixed(2),
      credit: 0,
      currency: "CNY",
      exchangeRate: 1,
    });
  }

  if (deductiblePurchaseTax > 0) {
    lines.push({
      accountId: vatAccount.id,
      description: `增值税结转-可抵扣进项税额（${period.name}）`,
      debit: 0,
      credit: +deductiblePurchaseTax.toFixed(2),
      currency: "CNY",
      exchangeRate: 1,
    });
  }

  // Net payable entry
  if (vatPayable > 0) {
    // 应缴：贷记未交增值税
    lines.push({
      accountId: vatAccount.id,
      description: `增值税结转-应缴增值税（${period.name}）`,
      debit: 0,
      credit: +vatPayable.toFixed(2),
      currency: "CNY",
      exchangeRate: 1,
    });
  } else if (vatPayable < 0) {
    // 留抵：借记留抵税额（仍用2221）
    lines.push({
      accountId: vatAccount.id,
      description: `增值税结转-留抵税额（${period.name}）`,
      debit: +(-vatPayable).toFixed(2),
      credit: 0,
      currency: "CNY",
      exchangeRate: 1,
    });
  }

  // Surtax lines (only if vatPayable > 0 and 6403 exists)
  const surtaxEntryLines: LineInput[] = [];
  if (vatPayable > 0 && taxExpenseAccount && totalSurtax > 0) {
    surtaxEntryLines.push({
      accountId: taxExpenseAccount.id,
      description: `税金及附加-城建税+教育费附加（${period.name}）`,
      debit: +totalSurtax.toFixed(2),
      credit: 0,
      currency: "CNY",
      exchangeRate: 1,
    });
    surtaxEntryLines.push({
      accountId: vatAccount.id,
      description: `税金及附加-应缴附加税（${period.name}）`,
      debit: 0,
      credit: +totalSurtax.toFixed(2),
      currency: "CNY",
      exchangeRate: 1,
    });
  }

  // Validate balance
  const allLines = [...lines, ...surtaxEntryLines];
  const totalDebit = allLines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = allLines.reduce((s, l) => s + l.credit, 0);

  if (Math.abs(totalDebit - totalCredit) > 0.005) {
    // Re-balance: shouldn't happen with correct logic, but safety check
    return NextResponse.json({
      error: `凭证借贷不平衡（借：${totalDebit.toFixed(2)} 贷：${totalCredit.toFixed(2)}）`,
    }, { status: 500 });
  }

  // Extract userId before transaction to preserve TypeScript narrowing
  const userId = session.user!.id as string;

  // Create journal entry in transaction
  const entry = await db.$transaction(async (tx) => {
    const je = await tx.journalEntry.create({
      data: {
        companyId,
        fiscalPeriodId,
        entryNumber,
        entryDate,
        description: `增值税结转凭证（${period.name}）`,
        status: "DRAFT",
        totalDebit: +totalDebit.toFixed(2),
        totalCredit: +totalCredit.toFixed(2),
        createdById: userId,
        lines: {
          create: allLines.map((l, i) => ({
            lineNumber: i + 1,
            accountId: l.accountId,
            description: l.description,
            debitAmount: l.debit,
            creditAmount: l.credit,
            currency: l.currency,
            exchangeRate: l.exchangeRate,
            functionalDebit: l.debit,
            functionalCredit: l.credit,
          })),
        },
      },
      select: { id: true, entryNumber: true },
    });

    await tx.auditLog.create({
      data: {
        companyId,
        userId,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: je.id,
        description: `生成增值税结转凭证 ${je.entryNumber}`,
      },
    });

    return je;
  });

  return NextResponse.json({
    success: true,
    entryId: entry.id,
    entryNumber: entry.entryNumber,
    summary: {
      salesTax: +salesTax.toFixed(2),
      deductiblePurchaseTax: +deductiblePurchaseTax.toFixed(2),
      nonDeductiblePurchaseTax: +nonDeductiblePurchaseTax.toFixed(2),
      vatPayable: +vatPayable.toFixed(2),
      urbanTax: +urbanTax.toFixed(2),
      eduTax: +eduTax.toFixed(2),
      localEduTax: +localEduTax.toFixed(2),
      totalSurtax: +totalSurtax.toFixed(2),
    },
  });
}
