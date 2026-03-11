import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";

const schema = z.object({
  fromCurrency: z.string().length(3).toUpperCase(),
  toCurrency: z.string().length(3).toUpperCase().default("CNY"),
  rate: z.string().refine((v) => parseFloat(v) > 0),
  rateType: z.enum(["SPOT", "AVERAGE", "CLOSING", "HISTORICAL"]),
  effectiveDate: z.string(),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未授权" }, { status: 401 });

  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: "数据验证失败" }, { status: 400 });

    const { fromCurrency, toCurrency, rate, rateType, effectiveDate } = parsed.data;

    const rate_record = await db.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_rateType_effectiveDate: {
          fromCurrency,
          toCurrency,
          rateType,
          effectiveDate: new Date(effectiveDate),
        },
      },
      create: {
        fromCurrency,
        toCurrency,
        rate,
        rateType,
        effectiveDate: new Date(effectiveDate),
        source: "MANUAL",
      },
      update: { rate, source: "MANUAL" },
    });

    return NextResponse.json({ rate: rate_record }, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
