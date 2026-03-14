import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// ── GET /api/customers?companyId=xxx ────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  if (!companyId) return NextResponse.json({ error: "缺少 companyId" }, { status: 400 });

  // 验证用户属于该公司所在组织
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

  const customers = await db.customer.findMany({
    where: { companyId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { code: "asc" },
  });

  return NextResponse.json(customers);
}

// ── POST /api/customers ─────────────────────────────────────────────────────
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
    creditLimit?: number;
    paymentTerms?: string;
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
  if (!membership) return NextResponse.json({ error: "无权创建客户" }, { status: 403 });

  // 检查编码唯一性
  const existing = await db.customer.findUnique({ where: { companyId_code: { companyId, code } } });
  if (existing) return NextResponse.json({ error: `客户编码 ${code} 已存在` }, { status: 409 });

  const customer = await db.customer.create({
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
      creditLimit: body.creditLimit ?? 0,
      paymentTerms: (body.paymentTerms as never) ?? "NET_30",
      notes: body.notes,
    },
  });

  return NextResponse.json(customer, { status: 201 });
}
