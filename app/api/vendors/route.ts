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

  const includeInactive = searchParams.get("includeInactive") === "true";

  const vendors = await db.vendor.findMany({
    where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(vendors);
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json() as {
    companyId: string;
    code: string;
    name: string;
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
  };

  const { companyId, code, name } = body;
  if (!companyId || !code || !name) {
    return NextResponse.json({ error: "缺少必填字段（companyId/code/name）" }, { status: 400 });
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
  if (!membership) return NextResponse.json({ error: "无权创建供应商" }, { status: 403 });

  const existing = await db.vendor.findUnique({ where: { companyId_code: { companyId, code } } });
  if (existing) return NextResponse.json({ error: `供应商编码 ${code} 已存在` }, { status: 409 });

  const vendor = await db.vendor.create({
    data: {
      companyId,
      code,
      name,
      taxId: body.taxId,
      contactName: body.contactName,
      phone: body.phone,
      email: body.email,
      address: body.address,
      currency: body.currency ?? "CNY",
      paymentTerms: (body.paymentTerms as never) ?? "NET_30",
      bankAccount: body.bankAccount,
      bankName: body.bankName,
      notes: body.notes,
    },
  });

  return NextResponse.json(vendor, { status: 201 });
}
