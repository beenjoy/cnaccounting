import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["open", "soft_close", "close"]),
  reason: z.string().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "数据验证失败" }, { status: 400 });
    }

    const { action, reason } = parsed.data;

    const period = await db.fiscalPeriod.findUnique({
      where: { id },
      include: { fiscalYear: true },
    });

    if (!period) {
      return NextResponse.json({ error: "期间不存在" }, { status: 404 });
    }

    if (period.fiscalYear.isClosed) {
      return NextResponse.json({ error: "会计年度已结账，无法修改期间状态" }, { status: 400 });
    }

    // 查询操作者角色（用于软关账权限校验）
    const member = await db.organizationMember.findFirst({
      where: { userId: session.user.id, organization: { companies: { some: { fiscalYears: { some: { periods: { some: { id } } } } } } } },
      select: { role: true },
    });
    if (!member) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const managerRoles = ["OWNER", "ADMIN", "PERIOD_MANAGER"];

    // 状态转换校验
    if (action === "soft_close") {
      if (!managerRoles.includes(member.role)) {
        return NextResponse.json({ error: "仅期间管理员/管理员/超级管理员可执行软关账" }, { status: 403 });
      }
      if (period.status !== "OPEN") {
        return NextResponse.json({ error: "仅开放状态的期间可以软关账" }, { status: 400 });
      }
    }

    if (action === "close") {
      if (!managerRoles.includes(member.role)) {
        return NextResponse.json({ error: "仅期间管理员/管理员/超级管理员可执行硬关账" }, { status: 403 });
      }
      if (period.status === "CLOSED") {
        return NextResponse.json({ error: "期间已经是关闭状态" }, { status: 400 });
      }
      if (period.status === "OPEN") {
        return NextResponse.json({ error: "请先执行软关账，再执行硬关账" }, { status: 400 });
      }
    }

    if (action === "open") {
      if (period.status === "OPEN") {
        return NextResponse.json({ error: "期间已经是开放状态" }, { status: 400 });
      }
      if (!reason || reason.trim() === "") {
        return NextResponse.json({ error: "重新开放期间必须填写原因" }, { status: 400 });
      }
    }

    // 执行状态更新
    let newStatus: "OPEN" | "SOFT_CLOSE" | "CLOSED";
    if (action === "open") newStatus = "OPEN";
    else if (action === "soft_close") newStatus = "SOFT_CLOSE";
    else newStatus = "CLOSED";

    const updated = await db.fiscalPeriod.update({
      where: { id },
      data: {
        status: newStatus,
        closedAt: action === "close" ? new Date() : (action === "open" ? null : period.closedAt),
        reopenedAt: action === "open" ? new Date() : null,
        reopenReason: action === "open" ? reason : null,
      },
    });

    // 审计日志
    const actionLabel =
      action === "open" ? "重新开放" : action === "soft_close" ? "软关账" : "硬关账";
    const auditAction =
      action === "open" ? "OPEN_PERIOD" : action === "soft_close" ? "SOFT_CLOSE_PERIOD" : "CLOSE_PERIOD";

    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: auditAction,
        entityType: "FiscalPeriod",
        entityId: id,
        description: `${actionLabel}期间 ${period.name}${reason ? `，原因：${reason}` : ""}`,
      },
    });

    return NextResponse.json({ period: updated });
  } catch (error) {
    console.error("更新期间状态失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
