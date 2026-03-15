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

const createSchema = z.object({
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  normalBalance: z.enum(["DEBIT", "CREDIT"]),
  parentId: z.string().optional().nullable(),
  isLeaf: z.boolean().default(true),
  reportCategory: z.enum(REPORT_CATEGORIES).optional().nullable(),
  description: z.string().optional().nullable(),
});

// ── GET /api/group-accounts ─────────────────────────────────────────────────
// 返回当前组织的所有集团科目（按 code 升序）
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "未找到成员信息" }, { status: 404 });
  }

  const accounts = await db.groupAccount.findMany({
    where: { organizationId: membership.organizationId },
    orderBy: { code: "asc" },
    include: {
      _count: { select: { children: true, mappings: true } },
    },
  });

  return NextResponse.json({ accounts });
}

// ── POST /api/group-accounts ────────────────────────────────────────────────
// 创建集团科目（仅 OWNER / ADMIN）
export async function POST(req: NextRequest) {
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

  const body = await req.json() as unknown;
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "数据验证失败", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const orgId = membership.organizationId;

  // 编码唯一性检查
  const existing = await db.groupAccount.findUnique({
    where: { organizationId_code: { organizationId: orgId, code: data.code } },
  });
  if (existing) {
    return NextResponse.json({ error: "集团科目编码已存在" }, { status: 400 });
  }

  // 确定层级 + 更新父科目的 isLeaf
  let level = 1;
  if (data.parentId) {
    const parent = await db.groupAccount.findUnique({
      where: { id: data.parentId },
    });
    if (!parent || parent.organizationId !== orgId) {
      return NextResponse.json({ error: "父科目不存在" }, { status: 400 });
    }
    if (parent.accountType !== data.accountType) {
      return NextResponse.json({ error: "子科目类型必须与父科目相同" }, { status: 400 });
    }
    level = parent.level + 1;

    // 父科目不再是末级
    if (parent.isLeaf) {
      await db.groupAccount.update({
        where: { id: parent.id },
        data: { isLeaf: false },
      });
    }
  }

  const account = await db.groupAccount.create({
    data: {
      organizationId: orgId,
      code: data.code,
      name: data.name,
      accountType: data.accountType,
      normalBalance: data.normalBalance,
      parentId: data.parentId ?? null,
      level,
      isLeaf: data.isLeaf,
      reportCategory: data.reportCategory ?? null,
      description: data.description ?? null,
    },
    include: {
      _count: { select: { children: true, mappings: true } },
    },
  });

  return NextResponse.json({ account }, { status: 201 });
}
