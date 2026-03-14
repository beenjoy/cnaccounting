import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function getVendorWithAuth(vendorId: string, userId: string) {
  const vendor = await db.vendor.findUnique({
    where: { id: vendorId },
    include: { company: { select: { organizationId: true } } },
  });
  if (!vendor) return { vendor: null, membership: null };

  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: vendor.company.organizationId },
  });
  return { vendor, membership };
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const { vendor, membership } = await getVendorWithAuth(id, session.user.id);
  if (!vendor) return NextResponse.json({ error: "供应商不存在" }, { status: 404 });
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
    paymentTerms?: string;
    bankAccount?: string;
    bankName?: string;
    notes?: string;
    isActive?: boolean;
  };

  const updated = await db.vendor.update({
    where: { id },
    data: {
      name: body.name,
      taxId: body.taxId,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      currency: body.currency,
      paymentTerms: body.paymentTerms as never,
      bankAccount: body.bankAccount,
      bankName: body.bankName,
      notes: body.notes,
      isActive: body.isActive,
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
  const { vendor, membership } = await getVendorWithAuth(id, session.user.id);
  if (!vendor) return NextResponse.json({ error: "供应商不存在" }, { status: 404 });
  if (!membership || !["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "无权删除" }, { status: 403 });
  }

  await db.vendor.update({ where: { id }, data: { isActive: false } });
  return NextResponse.json({ success: true });
}
