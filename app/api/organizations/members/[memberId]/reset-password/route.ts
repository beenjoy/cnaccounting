import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";

/** 生成随机临时密码（12位字母+数字） */
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pwd = "";
  // 确保包含大写、小写、数字
  pwd += "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)];
  pwd += "abcdefghjkmnpqrstuvwxyz"[Math.floor(Math.random() * 23)];
  pwd += "23456789"[Math.floor(Math.random() * 8)];
  for (let i = 3; i < 12; i++) {
    pwd += chars[Math.floor(Math.random() * chars.length)];
  }
  // Shuffle
  return pwd.split("").sort(() => Math.random() - 0.5).join("");
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const { memberId } = await params;

  try {
    // 当前用户必须是 OWNER 或 ADMIN
    const currentMembership = await db.organizationMember.findFirst({
      where: { userId: session.user.id, role: { in: ["OWNER", "ADMIN"] } },
    });
    if (!currentMembership) {
      return NextResponse.json({ error: "权限不足：仅 OWNER/ADMIN 可重置密码" }, { status: 403 });
    }

    // 目标成员必须属于同一组织
    const target = await db.organizationMember.findUnique({
      where: { id: memberId },
      include: { user: { select: { id: true, email: true, name: true } } },
    });
    if (!target || target.organizationId !== currentMembership.organizationId) {
      return NextResponse.json({ error: "成员不存在" }, { status: 404 });
    }

    // 不能重置自己的密码（用修改密码接口）
    if (target.userId === session.user.id) {
      return NextResponse.json({ error: "请使用「修改密码」功能修改自己的密码" }, { status: 400 });
    }

    // 不允许重置 OWNER 密码（只能 OWNER 自行修改）
    if (target.role === "OWNER" && currentMembership.role !== "OWNER") {
      return NextResponse.json({ error: "不能重置 OWNER 的密码" }, { status: 403 });
    }

    // 生成临时密码
    const tempPassword = generateTempPassword();
    const hashed = await bcrypt.hash(tempPassword, 12);

    await db.user.update({
      where: { id: target.userId },
      data: { password: hashed },
    });

    // 审计日志
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: target.userId,
        description: `管理员重置了用户 ${target.user.email} 的密码`,
      },
    });

    return NextResponse.json({
      success: true,
      tempPassword,          // 明文临时密码，仅此一次，请立即告知用户
      userEmail: target.user.email,
      userName: target.user.name,
    });
  } catch (error) {
    console.error("重置密码失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
