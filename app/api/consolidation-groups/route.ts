import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/consolidation-groups?organizationId=xxx
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const organizationId = searchParams.get("organizationId");
  if (!organizationId) return NextResponse.json({ error: "缺少 organizationId" }, { status: 400 });

  // Verify membership
  const member = await db.organizationMember.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const groups = await db.consolidationGroup.findMany({
    where: { organizationId },
    include: {
      members: {
        include: {
          company: { select: { id: true, name: true, code: true, isActive: true } },
        },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(groups);
}

// POST /api/consolidation-groups
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json() as {
    organizationId: string;
    name: string;
    description?: string;
    reportingCurrency?: string;
  };

  const { organizationId, name, description, reportingCurrency } = body;
  if (!organizationId || !name?.trim()) {
    return NextResponse.json({ error: "缺少必要参数" }, { status: 400 });
  }

  // Verify OWNER/ADMIN
  const member = await db.organizationMember.findFirst({
    where: { organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "无权限（需要管理员）" }, { status: 403 });
  }

  const group = await db.consolidationGroup.create({
    data: {
      organizationId,
      name: name.trim(),
      description: description?.trim() || null,
      reportingCurrency: reportingCurrency || "CNY",
    },
    include: { members: true },
  });

  return NextResponse.json(group, { status: 201 });
}
