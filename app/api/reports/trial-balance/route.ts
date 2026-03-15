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

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });
  const company = membership?.organization.companies[0];
  if (!company) return NextResponse.json({ error: "No company" }, { status: 404 });

  const period = await db.fiscalPeriod.findFirst({
    where: { id: periodId, fiscalYear: { companyId: company.id } },
    include: { fiscalYear: true },
  });
  if (!period) return NextResponse.json({ error: "Period not found" }, { status: 404 });

  type AccEntry = {
    code: string; name: string; type: string;
    openDebit: number; openCredit: number;
    periodDebit: number; periodCredit: number;
  };
  const map = new Map<string, AccEntry>();

  // ── 期初余额（所有先于本期的已过账行）────────────────────────────────────
  const priorLines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        companyId: company.id,
        status: "POSTED",
        fiscalPeriod: { endDate: { lt: period.startDate } },
      },
    },
    include: { account: { select: { code: true, name: true, accountType: true } } },
  });
  for (const line of priorLines) {
    const key = line.accountId;
    if (!map.has(key)) {
      map.set(key, { code: line.account.code, name: line.account.name, type: line.account.accountType, openDebit: 0, openCredit: 0, periodDebit: 0, periodCredit: 0 });
    }
    const e = map.get(key)!;
    e.openDebit  += parseFloat(line.debitAmountLC.toString());
    e.openCredit += parseFloat(line.creditAmountLC.toString());
  }

  // ── 本期发生额 ──────────────────────────────────────────────────────────
  const currentLines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: { companyId: company.id, fiscalPeriodId: periodId, status: "POSTED" },
    },
    include: { account: { select: { code: true, name: true, accountType: true } } },
  });
  for (const line of currentLines) {
    const key = line.accountId;
    if (!map.has(key)) {
      map.set(key, { code: line.account.code, name: line.account.name, type: line.account.accountType, openDebit: 0, openCredit: 0, periodDebit: 0, periodCredit: 0 });
    }
    const e = map.get(key)!;
    e.periodDebit  += parseFloat(line.debitAmountLC.toString());
    e.periodCredit += parseFloat(line.creditAmountLC.toString());
  }

  const rows = Array.from(map.values()).sort((a, b) => a.code.localeCompare(b.code));

  if (format === "csv") {
    const BOM = "\uFEFF";
    const header = ["科目编号", "科目名称", "科目类型", "期初借方", "期初贷方", "本期借方", "本期贷方", "期末借方", "期末贷方"];
    const csvLines = rows.map((r) => {
      const openNet    = r.openDebit - r.openCredit;
      const closingNet = openNet + (r.periodDebit - r.periodCredit);
      return [
        r.code,
        r.name,
        ACCOUNT_TYPE_LABELS[r.type] ?? r.type,
        Math.max(0,  openNet).toFixed(2),
        Math.max(0, -openNet).toFixed(2),
        r.periodDebit.toFixed(2),
        r.periodCredit.toFixed(2),
        Math.max(0,  closingNet).toFixed(2),
        Math.max(0, -closingNet).toFixed(2),
      ].join(",");
    });

    const totalOpenDebit  = rows.reduce((s, r) => s + Math.max(0,  r.openDebit - r.openCredit), 0);
    const totalOpenCredit = rows.reduce((s, r) => s + Math.max(0, -(r.openDebit - r.openCredit)), 0);
    const totalPeriodDebit  = rows.reduce((s, r) => s + r.periodDebit, 0);
    const totalPeriodCredit = rows.reduce((s, r) => s + r.periodCredit, 0);
    const totalCloseDebit  = rows.reduce((s, r) => {
      const net = (r.openDebit - r.openCredit) + (r.periodDebit - r.periodCredit);
      return s + Math.max(0, net);
    }, 0);
    const totalCloseCredit = rows.reduce((s, r) => {
      const net = (r.openDebit - r.openCredit) + (r.periodDebit - r.periodCredit);
      return s + Math.max(0, -net);
    }, 0);

    csvLines.push([
      "合计", "", "",
      totalOpenDebit.toFixed(2), totalOpenCredit.toFixed(2),
      totalPeriodDebit.toFixed(2), totalPeriodCredit.toFixed(2),
      totalCloseDebit.toFixed(2), totalCloseCredit.toFixed(2),
    ].join(","));

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
