import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// ── DELETE /api/group-account-mappings/[id] ─────────────────────────────────
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

  // 验证映射存在且属于当前组织（通过关联的集团科目验证）
  const mapping = await db.groupAccountMapping.findUnique({
    where: { id },
    include: {
      groupAccount: { select: { organizationId: true } },
    },
  });

  if (!mapping || mapping.groupAccount.organizationId !== membership.organizationId) {
    return NextResponse.json({ error: "映射不存在" }, { status: 404 });
  }

  await db.groupAccountMapping.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
