import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const createSchema = z.discriminatedUnion("mappingType", [
  z.object({
    groupAccountId: z.string(),
    companyId: z.string(),
    mappingType: z.literal("DIRECT"),
    localCode: z.string().min(1),
    priority: z.number().int().default(0),
  }),
  z.object({
    groupAccountId: z.string(),
    companyId: z.string(),
    mappingType: z.literal("RANGE"),
    rangeStart: z.string().min(1),
    rangeEnd: z.string().min(1),
    priority: z.number().int().default(0),
  }),
]);

// ── GET /api/group-account-mappings?groupAccountId=xxx ─────────────────────
export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const groupAccountId = searchParams.get("groupAccountId");

  if (!groupAccountId) {
    return NextResponse.json({ error: "缺少 groupAccountId 参数" }, { status: 400 });
  }

  // 验证该集团科目属于当前组织
  const groupAccount = await db.groupAccount.findUnique({
    where: { id: groupAccountId },
    select: { organizationId: true },
  });
  if (!groupAccount || groupAccount.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "集团科目不存在" }, { status: 404 });
  }

  const mappings = await db.groupAccountMapping.findMany({
    where: { groupAccountId },
    include: {
      company: { select: { id: true, name: true } },
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ mappings });
}

// ── POST /api/group-account-mappings ────────────────────────────────────────
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

  // 验证集团科目存在且属于当前组织
  const groupAccount = await db.groupAccount.findUnique({
    where: { id: data.groupAccountId },
  });
  if (!groupAccount || groupAccount.organizationId !== orgId) {
    return NextResponse.json({ error: "集团科目不存在" }, { status: 404 });
  }

  // 验证公司属于当前组织
  const company = await db.company.findUnique({
    where: { id: data.companyId },
  });
  if (!company || company.organizationId !== orgId) {
    return NextResponse.json({ error: "公司不存在" }, { status: 404 });
  }

  // DIRECT 映射：验证本地科目存在
  if (data.mappingType === "DIRECT") {
    const localAccount = await db.chartOfAccount.findFirst({
      where: { companyId: data.companyId, code: data.localCode },
    });
    if (!localAccount) {
      return NextResponse.json(
        { error: `本地科目 ${data.localCode} 在该公司科目表中不存在` },
        { status: 400 }
      );
    }
  }

  // RANGE 映射：验证 rangeStart ≤ rangeEnd（字符串比较）
  if (data.mappingType === "RANGE") {
    if (data.rangeStart > data.rangeEnd) {
      return NextResponse.json({ error: "起始编号不能大于结束编号" }, { status: 400 });
    }
  }

  const mapping = await db.groupAccountMapping.create({
    data: {
      groupAccountId: data.groupAccountId,
      companyId: data.companyId,
      mappingType: data.mappingType,
      localCode: data.mappingType === "DIRECT" ? data.localCode : null,
      rangeStart: data.mappingType === "RANGE" ? data.rangeStart : null,
      rangeEnd: data.mappingType === "RANGE" ? data.rangeEnd : null,
      priority: data.priority,
    },
    include: {
      company: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ mapping }, { status: 201 });
}
