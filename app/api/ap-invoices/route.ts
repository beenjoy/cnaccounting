import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "缺少 companyId" }, { status: 400 });

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true },
  });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id, organizationId: company.organizationId },
  });
  if (!membership) return NextResponse.json({ error: "无权访问" }, { status: 403 });

  const vendorId = searchParams.get("vendorId");
  const status = searchParams.get("status");

  const invoices = await db.aPInvoice.findMany({
    where: {
      companyId,
      ...(vendorId ? { vendorId } : {}),
      ...(status ? { status: status as never } : {}),
    },
    include: { vendor: { select: { name: true, code: true } } },
    orderBy: { invoiceDate: "desc" },
  });

  return NextResponse.json(invoices);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json() as {
    companyId: string;
    vendorId: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string;
    currency?: string;
    subtotal: number;
    taxAmount?: number;
    description?: string;
  };

  const { companyId, vendorId, invoiceNumber, invoiceDate, dueDate, subtotal } = body;
  if (!companyId || !vendorId || !invoiceNumber || !invoiceDate || !dueDate || subtotal == null) {
    return NextResponse.json({ error: "缺少必填字段" }, { status: 400 });
  }

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true },
  });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organizationId: company.organizationId,
      role: { in: ["OWNER", "ADMIN", "ACCOUNTANT"] },
    },
  });
  if (!membership) return NextResponse.json({ error: "无权创建发票" }, { status: 403 });

  const existing = await db.aPInvoice.findUnique({
    where: { companyId_invoiceNumber: { companyId, invoiceNumber } },
  });
  if (existing) return NextResponse.json({ error: `发票号 ${invoiceNumber} 已存在` }, { status: 409 });

  const taxAmount = body.taxAmount ?? 0;
  const totalAmount = subtotal + taxAmount;

  const invoice = await db.aPInvoice.create({
    data: {
      companyId,
      vendorId,
      invoiceNumber,
      invoiceDate: new Date(invoiceDate),
      dueDate: new Date(dueDate),
      currency: body.currency ?? "CNY",
      subtotal,
      taxAmount,
      totalAmount,
      description: body.description,
      status: "OPEN",
    },
  });

  return NextResponse.json(invoice, { status: 201 });
}
