import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/fixed-assets/[id]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const asset = await db.fixedAsset.findUnique({
    where: { id },
    include: {
      costAccount: { select: { id: true, code: true, name: true } },
      accDepAccount: { select: { id: true, code: true, name: true } },
      depExpAccount: { select: { id: true, code: true, name: true } },
      depreciationRecords: {
        include: { fiscalPeriod: { select: { name: true } } },
        orderBy: { fiscalPeriod: { startDate: "desc" } },
      },
    },
  });
  if (!asset) return NextResponse.json({ error: "资产不存在" }, { status: 404 });

  const company = await db.company.findUnique({
    where: { id: asset.companyId },
    select: { organizationId: true },
  });
  const member = await db.organizationMember.findFirst({
    where: { organizationId: company!.organizationId, userId: session.user.id },
  });
  if (!member) return NextResponse.json({ error: "无权限" }, { status: 403 });

  return NextResponse.json(asset);
}

// PUT /api/fixed-assets/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const asset = await db.fixedAsset.findUnique({
    where: { id },
    select: { id: true, companyId: true, status: true },
  });
  if (!asset) return NextResponse.json({ error: "资产不存在" }, { status: 404 });

  const company = await db.company.findUnique({
    where: { id: asset.companyId },
    select: { organizationId: true },
  });
  const member = await db.organizationMember.findFirst({
    where: { organizationId: company!.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (asset.status === "DISPOSED") {
    return NextResponse.json({ error: "已处置资产不可修改" }, { status: 400 });
  }

  const body = await req.json() as Record<string, unknown>;

  const updated = await db.fixedAsset.update({
    where: { id },
    data: {
      name: body.name as string | undefined,
      category: body.category as never,
      department: (body.department as string | null) ?? undefined,
      location: (body.location as string | null) ?? undefined,
      serialNumber: (body.serialNumber as string | null) ?? undefined,
      residualRate: body.residualRate as number | undefined,
      usefulLifeMonths: body.usefulLifeMonths as number | undefined,
      depreciationMethod: body.depreciationMethod as never,
      totalWorkload: (body.totalWorkload as number | null) ?? undefined,
      costAccountId: (body.costAccountId as string | null) ?? undefined,
      accDepAccountId: (body.accDepAccountId as string | null) ?? undefined,
      depExpAccountId: (body.depExpAccountId as string | null) ?? undefined,
      status: body.status as never,
      notes: (body.notes as string | null) ?? undefined,
    },
  });

  await db.auditLog.create({
    data: {
      companyId: asset.companyId,
      userId: session.user.id,
      action: "UPDATE",
      entityType: "FixedAsset",
      entityId: id,
      description: `修改固定资产 ${updated.assetNumber}`,
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/fixed-assets/[id]  — only draft assets with no depreciation history
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const asset = await db.fixedAsset.findUnique({
    where: { id },
    select: { id: true, companyId: true, assetNumber: true, name: true, _count: { select: { depreciationRecords: true } } },
  });
  if (!asset) return NextResponse.json({ error: "资产不存在" }, { status: 404 });

  if (asset._count.depreciationRecords > 0) {
    return NextResponse.json({ error: "已有折旧记录，不可删除。请改为处置操作。" }, { status: 400 });
  }

  const company = await db.company.findUnique({
    where: { id: asset.companyId },
    select: { organizationId: true },
  });
  const member = await db.organizationMember.findFirst({
    where: { organizationId: company!.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "无权限，仅 OWNER/ADMIN 可删除" }, { status: 403 });
  }

  await db.fixedAsset.delete({ where: { id } });

  await db.auditLog.create({
    data: {
      companyId: asset.companyId,
      userId: session.user.id,
      action: "DELETE",
      entityType: "FixedAsset",
      entityId: id,
      description: `删除固定资产 ${asset.assetNumber} ${asset.name}`,
    },
  });

  return NextResponse.json({ success: true });
}
