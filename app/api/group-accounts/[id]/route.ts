import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const REPORT_CATEGORIES = [
  "CURRENT_ASSET", "NON_CURRENT_ASSET",
  "CURRENT_LIABILITY", "NON_CURRENT_LIABILITY",
  "EQUITY_ITEM",
  "OPERATING_REVENUE", "NON_OPERATING_INCOME",
  "OPERATING_COST", "PERIOD_EXPENSE", "NON_OPERATING_EXPENSE", "INCOME_TAX",
] as const;

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  isLeaf: z.boolean().optional(),
  reportCategory: z.enum(REPORT_CATEGORIES).optional().nullable(),
  description: z.string().optional().nullable(),
});

// ── PUT /api/group-accounts/[id] ────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "未找到成员信息" }, { status: 404 });
  }
  if (!["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "无操作权限" }, { status: 403 });
  }

  const { id } = await params;

  const account = await db.groupAccount.findUnique({ where: { id } });
  if (!account || account.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "集团科目不存在" }, { status: 404 });
  }

  const body = await req.json() as unknown;
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "数据验证失败" }, { status: 400 });
  }

  const updated = await db.groupAccount.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined && { name: parsed.data.name }),
      ...(parsed.data.isLeaf !== undefined && { isLeaf: parsed.data.isLeaf }),
      ...(parsed.data.reportCategory !== undefined && { reportCategory: parsed.data.reportCategory }),
      ...(parsed.data.description !== undefined && { description: parsed.data.description }),
    },
    include: {
      _count: { select: { children: true, mappings: true } },
    },
  });

  return NextResponse.json({ account: updated });
}

// ── DELETE /api/group-accounts/[id] ─────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "未找到成员信息" }, { status: 404 });
  }
  if (!["OWNER", "ADMIN"].includes(membership.role)) {
    return NextResponse.json({ error: "无操作权限" }, { status: 403 });
  }

  const { id } = await params;

  const account = await db.groupAccount.findUnique({
    where: { id },
    include: {
      _count: { select: { children: true, mappings: true } },
    },
  });

  if (!account || account.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "集团科目不存在" }, { status: 404 });
  }
  if (account._count.children > 0) {
    return NextResponse.json({ error: "该科目下还有子科目，无法删除" }, { status: 400 });
  }
  if (account._count.mappings > 0) {
    return NextResponse.json({ error: "该科目存在公司映射，请先删除映射" }, { status: 400 });
  }

  await db.groupAccount.delete({ where: { id } });

  // 若父科目的所有子科目都已删除，则将父科目重新标记为末级
  if (account.parentId) {
    const siblingCount = await db.groupAccount.count({
      where: { parentId: account.parentId },
    });
    if (siblingCount === 0) {
      await db.groupAccount.update({
        where: { id: account.parentId },
        data: { isLeaf: true },
      });
    }
  }

  return NextResponse.json({ success: true });
}
