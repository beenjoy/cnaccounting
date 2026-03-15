import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "资产",
  LIABILITY: "负债",
  EQUITY: "所有者权益",
  REVENUE: "收入",
  EXPENSE: "费用",
};

// GET /api/reports/trial-balance?periodId=xxx&format=csv
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const periodId = searchParams.get("periodId");
  const format = searchParams.get("format") ?? "csv";

  if (!periodId) return NextResponse.json({ error: "periodId required" }, { status: 400 });

  // Get company via membership
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });
  const company = membership?.organization.companies[0];
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  // Verify period belongs to company
  const period = await db.fiscalPeriod.findFirst({
    where: { id: periodId, fiscalYear: { companyId: company.id } },
    include: { fiscalYear: true },
  });
  if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: { companyId: company.id, fiscalPeriodId: periodId, status: "POSTED" },
    },
    include: {
      account: { select: { code: true, name: true, accountType: true } },
    },
  });

  // Aggregate by account
  const map = new Map<string, { code: string; name: string; type: string; debit: number; credit: number }>();
  for (const line of lines) {
    const key = line.accountId;
    if (!map.has(key)) {
      map.set(key, { code: line.account.code, name: line.account.name, type: line.account.accountType, debit: 0, credit: 0 });
    }
    const e = map.get(key)!;
    e.debit += parseFloat(line.debitAmountLC.toString());
    e.credit += parseFloat(line.creditAmountLC.toString());
  }

  const rows = Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));

  if (format === "csv") {
    const BOM = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    const header = ["科目编号", "科目名称", "科目类型", "借方发生额", "贷方发生额", "借方余额", "贷方余额"];
    const csvLines = rows.map((r) => {
      const netDebit = Math.max(0, r.debit - r.credit);
      const netCredit = Math.max(0, r.credit - r.debit);
      return [
        r.code,
        r.name,
        ACCOUNT_TYPE_LABELS[r.type] ?? r.type,
        r.debit.toFixed(2),
        r.credit.toFixed(2),
        netDebit.toFixed(2),
        netCredit.toFixed(2),
      ].join(",");
    });

    // Totals row
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    csvLines.push(["合计", "", "", totalDebit.toFixed(2), totalCredit.toFixed(2), "", ""].join(","));

    const csv = BOM + [header.join(","), ...csvLines].join("\n");
    const periodLabel = period.name.replace(/[^0-9a-zA-Z\u4e00-\u9fa5]/g, "_");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="trial-balance-${periodLabel}.csv"`,
      },
    });
  }

  return NextResponse.json({ error: "Unsupported format" }, { status: 400 });
}
