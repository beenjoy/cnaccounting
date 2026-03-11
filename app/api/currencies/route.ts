import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  code: z.string().length(3).toUpperCase(),
  name: z.string().min(1),
  nameEn: z.string().optional(),
  symbol: z.string().min(1),
  decimals: z.number().int().min(0).max(8).default(2),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未授权" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "数据验证失败" }, { status: 400 });

    const existing = await db.currency.findUnique({ where: { code: parsed.data.code } });
    if (existing) return NextResponse.json({ error: "货币代码已存在" }, { status: 400 });

    const currency = await db.currency.create({ data: parsed.data });
    return NextResponse.json({ currency }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
