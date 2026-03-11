import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  action: z.enum(["open", "close"]),
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

    if (action === "open" && period.status === "OPEN") {
      return NextResponse.json({ error: "期间已经是开放状态" }, { status: 400 });
    }

    if (action === "close" && period.status === "CLOSED") {
      return NextResponse.json({ error: "期间已经是关闭状态" }, { status: 400 });
    }

    if (action === "open" && (!reason || reason.trim() === "")) {
      return NextResponse.json({ error: "重新开放期间必须填写原因" }, { status: 400 });
    }

    const updated = await db.fiscalPeriod.update({
      where: { id },
      data: {
        status: action === "open" ? "OPEN" : "CLOSED",
        closedAt: action === "close" ? new Date() : period.closedAt,
        reopenedAt: action === "open" ? new Date() : null,
        reopenReason: action === "open" ? reason : null,
      },
    });

    // 记录审计日志
    await db.auditLog.create({
      data: {
        userId: session.user.id,
        action: action === "open" ? "OPEN_PERIOD" : "CLOSE_PERIOD",
        entityType: "FiscalPeriod",
        entityId: id,
        description: `${action === "open" ? "重新开放" : "关闭"}期间 ${period.name}${reason ? `，原因：${reason}` : ""}`,
      },
    });

    return NextResponse.json({ period: updated });
  } catch (error) {
    console.error("更新期间状态失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
