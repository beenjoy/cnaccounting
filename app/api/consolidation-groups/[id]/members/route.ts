import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/consolidation-groups/[id]/members  — add a company to the group
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id: groupId } = await params;

  const group = await db.consolidationGroup.findUnique({
    where: { id: groupId },
    select: { organizationId: true },
  });
  if (!group) return NextResponse.json({ error: "合并组不存在" }, { status: 404 });

  const member = await db.organizationMember.findFirst({
    where: { organizationId: group.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN"].includes(member.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json() as {
    companyId: string;
    memberType?: "PARENT" | "SUBSIDIARY";
    ownershipPct?: number;
    consolidationMethod?: "FULL" | "EQUITY" | "COST";
    investmentAccountCode?: string;
    sortOrder?: number;
  };

  const { companyId, memberType = "SUBSIDIARY", ownershipPct = 1.0,
          consolidationMethod = "FULL", investmentAccountCode, sortOrder = 0 } = body;

  if (!companyId) return NextResponse.json({ error: "缺少 companyId" }, { status: 400 });

  // Verify the company belongs to the same organization
  const company = await db.company.findFirst({
    where: { id: companyId, organizationId: group.organizationId },
    select: { id: true },
  });
  if (!company) return NextResponse.json({ error: "公司不属于该组织" }, { status: 400 });

  // Only one PARENT is allowed per group
  if (memberType === "PARENT") {
    const existingParent = await db.consolidationMember.findFirst({
      where: { groupId, memberType: "PARENT" },
    });
    if (existingParent) {
      return NextResponse.json({ error: "每个合并组只能有一个母公司" }, { status: 400 });
    }
  }

  const groupMember = await db.consolidationMember.create({
    data: {
      groupId,
      companyId,
      memberType,
      ownershipPct,
      consolidationMethod,
      investmentAccountCode: investmentAccountCode?.trim() || null,
      sortOrder,
    },
    include: {
      company: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(groupMember, { status: 201 });
}
