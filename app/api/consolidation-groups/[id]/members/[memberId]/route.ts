import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// DELETE /api/consolidation-groups/[id]/members/[memberId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: groupId, memberId } = await params;

  const group = await db.consolidationGroup.findUnique({
    where: { id: groupId },
    select: { organizationId: true },
  });
  if (!group) return NextResponse.json({ error: "合并组不存在" }, { status: 404 });

  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId: group.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!orgMember || !["OWNER", "ADMIN"].includes(orgMember.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  await db.consolidationMember.delete({
    where: { id: memberId, groupId },
  });

  return NextResponse.json({ success: true });
}

// PUT /api/consolidation-groups/[id]/members/[memberId]  — update ownership/method
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: groupId, memberId } = await params;

  const group = await db.consolidationGroup.findUnique({
    where: { id: groupId },
    select: { organizationId: true },
  });
  if (!group) return NextResponse.json({ error: "合并组不存在" }, { status: 404 });

  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId: group.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!orgMember || !["OWNER", "ADMIN"].includes(orgMember.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json() as {
    ownershipPct?: number;
    consolidationMethod?: string;
    investmentAccountCode?: string;
    sortOrder?: number;
  };

  const updated = await db.consolidationMember.update({
    where: { id: memberId, groupId },
    data: {
      ...(body.ownershipPct !== undefined ? { ownershipPct: body.ownershipPct } : {}),
      ...(body.consolidationMethod ? { consolidationMethod: body.consolidationMethod as never } : {}),
      ...(body.investmentAccountCode !== undefined ? { investmentAccountCode: body.investmentAccountCode?.trim() || null } : {}),
      ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
    },
    include: { company: { select: { id: true, name: true, code: true } } },
  });

  return NextResponse.json(updated);
}
