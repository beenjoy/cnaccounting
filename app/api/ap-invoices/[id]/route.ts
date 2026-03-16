import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const invoice = await db.aPInvoice.findUnique({
    where: { id },
    include: { company: { select: { organizationId: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "发票不存在" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organizationId: invoice.company.organizationId,
      role: { in: ["OWNER", "ADMIN", "ACCOUNTANT"] },
    },
  });
  if (!membership) return NextResponse.json({ error: "无权修改" }, { status: 403 });

  if (invoice.status === "PAID" || invoice.status === "CANCELLED") {
    return NextResponse.json({ error: "该状态的发票不可修改" }, { status: 400 });
  }

  const body = await req.json() as {
    action?: string;
    // record_payment 字段
    amount?: number;
    matchedDate?: string;
    notes?: string;
    // 通用更新字段
    invoiceDate?: string;
    dueDate?: string;
    subtotal?: number;
    taxAmount?: number;
    description?: string;
    status?: string;
  };

  // ── 付款登记操作 ─────────────────────────────────────────────────────────────
  if (body.action === "record_payment") {
    const amount = body.amount;
    if (!amount || amount <= 0) {
      return NextResponse.json({ error: "付款金额无效" }, { status: 400 });
    }
    if (!body.matchedDate) {
      return NextResponse.json({ error: "请提供付款日期" }, { status: 400 });
    }

    const currentPaid = parseFloat(invoice.paidAmount.toString());
    const totalAmt    = parseFloat(invoice.totalAmount.toString());
    const newPaid     = currentPaid + amount;

    if (newPaid > totalAmt + 0.001) {
      return NextResponse.json({ error: "付款金额超过发票未付余额" }, { status: 400 });
    }

    const newStatus = newPaid >= totalAmt - 0.001 ? "PAID" : "PARTIAL";

    await db.aPInvoice.update({
      where: { id },
      data: { paidAmount: newPaid, status: newStatus as never },
    });

    return NextResponse.json({ success: true, paidAmount: newPaid, status: newStatus });
  }

  // ── 通用字段更新 ─────────────────────────────────────────────────────────────
  const subtotal  = body.subtotal  ?? parseFloat(invoice.subtotal.toString());
  const taxAmount = body.taxAmount ?? parseFloat(invoice.taxAmount.toString());

  const updated = await db.aPInvoice.update({
    where: { id },
    data: {
      invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : undefined,
      dueDate:     body.dueDate     ? new Date(body.dueDate)     : undefined,
      subtotal:    body.subtotal,
      taxAmount:   body.taxAmount,
      totalAmount: subtotal + taxAmount,
      description: body.description,
      status:      body.status as never,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const invoice = await db.aPInvoice.findUnique({
    where: { id },
    include: { company: { select: { organizationId: true } } },
  });
  if (!invoice) return NextResponse.json({ error: "发票不存在" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organizationId: invoice.company.organizationId,
      role: { in: ["OWNER", "ADMIN"] },
    },
  });
  if (!membership) return NextResponse.json({ error: "无权操作" }, { status: 403 });

  if (invoice.status === "PAID") {
    return NextResponse.json({ error: "已全额核销的发票不可作废" }, { status: 400 });
  }

  await db.aPInvoice.update({ where: { id }, data: { status: "CANCELLED" } });
  return NextResponse.json({ success: true });
}
