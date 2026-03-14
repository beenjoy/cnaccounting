import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const record = await db.vATRecord.findUnique({
    where: { id },
    include: { company: { select: { organizationId: true } } },
  });
  if (!record) return NextResponse.json({ error: "记录不存在" }, { status: 404 });

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organizationId: record.company.organizationId,
      role: { in: ["OWNER", "ADMIN", "ACCOUNTANT"] },
    },
  });
  if (!membership) return NextResponse.json({ error: "无权删除" }, { status: 403 });

  await db.vATRecord.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
