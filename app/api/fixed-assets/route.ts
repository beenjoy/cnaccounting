import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/fixed-assets?companyId=xxx&status=ACTIVE&category=ELECTRONICS
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const companyId = searchParams.get("companyId");
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  if (!companyId) return NextResponse.json({ error: "缺少 companyId" }, { status: 400 });

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true },
  });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const member = await db.organizationMember.findFirst({
    where: { organizationId: company.organizationId, userId: session.user.id },
  });
  if (!member) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const assets = await db.fixedAsset.findMany({
    where: {
      companyId,
      ...(status ? { status: status as never } : {}),
      ...(category ? { category: category as never } : {}),
    },
    include: {
      costAccount: { select: { id: true, code: true, name: true } },
      accDepAccount: { select: { id: true, code: true, name: true } },
      depExpAccount: { select: { id: true, code: true, name: true } },
      _count: { select: { depreciationRecords: true } },
    },
    orderBy: { assetNumber: "asc" },
  });

  return NextResponse.json(assets);
}

// POST /api/fixed-assets
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json() as {
    companyId: string;
    name: string;
    category: string;
    department?: string;
    location?: string;
    serialNumber?: string;
    acquisitionDate: string;
    acquisitionCost: number;
    residualRate: number;
    usefulLifeMonths: number;
    depreciationMethod: string;
    totalWorkload?: number;
    costAccountId?: string;
    accDepAccountId?: string;
    depExpAccountId?: string;
    notes?: string;
  };

  const { companyId } = body;

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true },
  });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const member = await db.organizationMember.findFirst({
    where: { organizationId: company.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  // Generate asset number
  const year = new Date(body.acquisitionDate).getFullYear();
  const lastAsset = await db.fixedAsset.findFirst({
    where: { companyId, assetNumber: { startsWith: `FA-${year}-` } },
    orderBy: { assetNumber: "desc" },
    select: { assetNumber: true },
  });
  let nextSeq = 1;
  if (lastAsset) {
    const parts = lastAsset.assetNumber.split("-");
    nextSeq = parseInt(parts[2] ?? "0", 10) + 1;
  }
  const assetNumber = `FA-${year}-${String(nextSeq).padStart(5, "0")}`;

  const asset = await db.fixedAsset.create({
    data: {
      companyId,
      assetNumber,
      name: body.name,
      category: body.category as never,
      department: body.department ?? null,
      location: body.location ?? null,
      serialNumber: body.serialNumber ?? null,
      acquisitionDate: new Date(body.acquisitionDate),
      acquisitionCost: body.acquisitionCost,
      residualRate: body.residualRate,
      usefulLifeMonths: body.usefulLifeMonths,
      depreciationMethod: body.depreciationMethod as never,
      totalWorkload: body.totalWorkload ?? null,
      costAccountId: body.costAccountId ?? null,
      accDepAccountId: body.accDepAccountId ?? null,
      depExpAccountId: body.depExpAccountId ?? null,
      notes: body.notes ?? null,
    },
  });

  await db.auditLog.create({
    data: {
      companyId,
      userId: session.user.id,
      action: "CREATE",
      entityType: "FixedAsset",
      entityId: asset.id,
      description: `新增固定资产 ${asset.assetNumber} ${asset.name}`,
    },
  });

  return NextResponse.json(asset, { status: 201 });
}
