import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  companyId: z.string(),
  year: z.number().int().min(2000).max(2100),
});

const monthNames = [
  "一月", "二月", "三月", "四月", "五月", "六月",
  "七月", "八月", "九月", "十月", "十一月", "十二月",
];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "数据验证失败" }, { status: 400 });
    }

    const { companyId, year } = parsed.data;

    const existing = await db.fiscalYear.findFirst({
      where: { companyId, year },
    });
    if (existing) {
      return NextResponse.json({ error: `${year}年度已存在` }, { status: 400 });
    }

    const fiscalYear = await db.$transaction(async (tx) => {
      const fy = await tx.fiscalYear.create({
        data: {
          companyId,
          year,
          startDate: new Date(`${year}-01-01`),
          endDate: new Date(`${year}-12-31`),
        },
      });

      for (let i = 1; i <= 12; i++) {
        const startDate = new Date(year, i - 1, 1);
        const endDate = new Date(year, i, 0);
        await tx.fiscalPeriod.create({
          data: {
            fiscalYearId: fy.id,
            periodNumber: i,
            name: `${year}年${monthNames[i - 1]}`,
            startDate,
            endDate,
            status: "OPEN",
          },
        });
      }

      return fy;
    });

    return NextResponse.json({ fiscalYear }, { status: 201 });
  } catch (error) {
    console.error("创建会计年度失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
