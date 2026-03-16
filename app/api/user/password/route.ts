import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import bcrypt from "bcryptjs";

const schema = z.object({
  currentPassword: z.string().min(1, "请输入当前密码"),
  newPassword: z
    .string()
    .min(8, "新密码至少8位")
    .regex(/[A-Za-z]/, "新密码需包含字母")
    .regex(/[0-9]/, "新密码需包含数字"),
  confirmPassword: z.string().min(1, "请确认新密码"),
}).refine((d) => d.newPassword === d.confirmPassword, {
  message: "两次输入的新密码不一致",
  path: ["confirmPassword"],
});

export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const firstError = parsed.error.errors[0];
      return NextResponse.json(
        { error: firstError?.message ?? "数据验证失败", field: firstError?.path[0] },
        { status: 400 }
      );
    }

    // 获取用户当前密码哈希
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, password: true },
    });
    if (!user || !user.password) {
      return NextResponse.json({ error: "用户不存在或未设置密码" }, { status: 400 });
    }

    // 验证当前密码
    const isValid = await bcrypt.compare(parsed.data.currentPassword, user.password);
    if (!isValid) {
      return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
    }

    // 不能与当前密码相同
    const isSame = await bcrypt.compare(parsed.data.newPassword, user.password);
    if (isSame) {
      return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
    }

    // 哈希新密码
    const hashed = await bcrypt.hash(parsed.data.newPassword, 12);
    await db.user.update({
      where: { id: session.user.id },
      data: { password: hashed },
    });

    // 审计日志
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: "UPDATE",
        entityType: "User",
        entityId: session.user.id,
        description: "修改登录密码",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("修改密码失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
