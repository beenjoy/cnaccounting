import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// ── GET /api/vat-records?companyId=xxx&periodId=yyy&direction=SALES ──────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "缺少 companyId" }, { status: 400 });

  const company = await db.company.findUnique({ where: { id: companyId }, select: { organizationId: true } });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id, organizationId: company.organizationId },
  });
  if (!membership) return NextResponse.json({ error: "无权访问" }, { status: 403 });

  const direction = searchParams.get("direction");
  const periodId = searchParams.get("periodId");

  const records = await db.vATRecord.findMany({
    where: {
      companyId,
      ...(direction ? { direction: direction as "SALES" | "PURCHASE" } : {}),
      ...(periodId ? { fiscalPeriodId: periodId } : {}),
    },
    orderBy: { invoiceDate: "desc" },
  });

  return NextResponse.json(records);
}

// ── POST /api/vat-records ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json() as {
    companyId: string;
    fiscalPeriodId?: string;
    direction: "SALES" | "PURCHASE";
    invoiceType?: string;
    invoiceNumber: string;
    invoiceDate: string;
    counterparty: string;
    counterpartyTaxId?: string;
    amount: number;
    taxRate: number;
    taxAmount: number;
    deductible?: boolean;
    journalEntryId?: string;
    notes?: string;
  };

  const { companyId, direction, invoiceNumber, invoiceDate, counterparty, amount, taxRate, taxAmount } = body;
  if (!companyId || !direction || !invoiceNumber || !invoiceDate || !counterparty) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  const company = await db.company.findUnique({ where: { id: companyId }, select: { organizationId: true } });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organizationId: company.organizationId,
      role: { in: ["OWNER", "ADMIN", "ACCOUNTANT"] },
    },
  });
  if (!membership) return NextResponse.json({ error: "无权创建增值税记录" }, { status: 403 });

  const record = await db.vATRecord.create({
    data: {
      companyId,
      fiscalPeriodId: body.fiscalPeriodId ?? null,
      direction,
      invoiceType: (body.invoiceType as never) ?? "SPECIAL_VAT",
      invoiceNumber,
      invoiceDate: new Date(invoiceDate),
      counterparty,
      counterpartyTaxId: body.counterpartyTaxId,
      amount,
      taxRate,
      taxAmount,
      deductible: body.deductible ?? true,
      journalEntryId: body.journalEntryId,
      notes: body.notes,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
