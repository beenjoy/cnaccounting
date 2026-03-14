import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({
  role: z.enum(["ADMIN", "ACCOUNTANT", "AUDITOR", "PERIOD_MANAGER"]),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { memberId } = await params;

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "无效角色" }, { status: 400 });
    }

    // 当前用户必须是 OWNER
    const currentMembership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: "OWNER" },
    });
    if (!currentMembership) {
      return NextResponse.json({ error: "只有 OWNER 可以修改成员角色" }, { status: 403 });
    }

    // 目标成员必须属于同一组织
    const target = await db.organizationMember.findUnique({ where: { id: memberId } });
    if (!target || target.organizationId !== currentMembership.organizationId) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }

    // 不能修改 OWNER 角色
    if (target.role === "OWNER") {
      return NextResponse.json({ error: "不能修改 OWNER 的角色" }, { status: 400 });
    }

    // 不能修改自己
    if (target.userId === session.user.id) {
      return NextResponse.json({ error: "不能修改自己的角色" }, { status: 400 });
    }

    const updated = await db.organizationMember.update({
      where: { id: memberId },
      data: { role: parsed.data.role },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        entityType: "OrganizationMember",
        entityId: memberId,
        description: `修改成员角色 → ${parsed.data.role}`,
        oldValues: { role: target.role },
        newValues: { role: parsed.data.role },
      },
    });

    return NextResponse.json({ success: true, role: updated.role });
  } catch (error) {
    console.error("修改成员角色失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
