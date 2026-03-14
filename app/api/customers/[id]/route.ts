import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function getCustomerWithAuth(customerId: string, userId: string) {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    include: { company: { select: { organizationId: true } } },
  });
  if (!customer) return { customer: null, membership: null };

  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: customer.company.organizationId },
  });
  return { customer, membership };
}

// ── PUT /api/customers/[id] ─────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { customer, membership } = await getCustomerWithAuth(id, session.user.id);
  if (!customer) return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  if (!membership || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(membership.role)) {
    return NextResponse.json({ error: "无权修改" }, { status: 403 });
  }

  const body = await req.json() as {
    name?: string;
    taxId?: string;
    contactName?: string;
    phone?: string;
    email?: string;
    address?: string;
    currency?: string;
    creditLimit?: number;
    paymentTerms?: string;
    notes?: string;
    isActive?: boolean;
  };

  const updated = await db.customer.update({
    where: { id },
    data: {
      name: body.name,
      taxId: body.taxId,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      currency: body.currency,
      creditLimit: body.creditLimit,
      paymentTerms: body.paymentTerms as never,
      notes: body.notes,
      isActive: body.isActive,
    },
  });

  return NextResponse.json(updated);
}

// ── DELETE /api/customers/[id] ──────────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { customer, membership } = await getCustomerWithAuth(id, session.user.id);
  if (!customer) return NextResponse.json({ error: "客户不存在" }, { status: 404 });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "无权删除" }, { status: 403 });
  }

  // 软删除（置为 inactive）
  await db.customer.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
