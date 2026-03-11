import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const REPORT_CATEGORIES = [
  "CURRENT_ASSET", "NON_CURRENT_ASSET",
  "CURRENT_LIABILITY", "NON_CURRENT_LIABILITY",
  "EQUITY_ITEM",
  "OPERATING_REVENUE", "NON_OPERATING_INCOME",
  "OPERATING_COST", "PERIOD_EXPENSE", "NON_OPERATING_EXPENSE", "INCOME_TAX",
] as const;

const updateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  isLeaf: z.boolean(),
  reportCategory: z.enum(REPORT_CATEGORIES).optional().nullable(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "数据验证失败" }, { status: 400 });
    }

    const account = await db.chartOfAccount.findUnique({ where: { id } });
    if (!account) {
      return NextResponse.json({ error: "科目不存在" }, { status: 404 });
    }

    // 如果有子科目则不能设为末级
    if (parsed.data.isLeaf) {
      const childCount = await db.chartOfAccount.count({
        where: { parentId: id },
      });
      if (childCount > 0) {
        return NextResponse.json(
          { error: "该科目有子科目，不能设为末级科目" },
          { status: 400 }
        );
      }
    }

    const updated = await db.chartOfAccount.update({
      where: { id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        isLeaf: parsed.data.isLeaf,
        reportCategory: parsed.data.reportCategory ?? null,
      },
    });

    return NextResponse.json({ account: updated });
  } catch (error) {
    console.error("更新科目失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
