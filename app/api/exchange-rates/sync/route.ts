import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// Frankfurter API response shape
interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

/**
 * POST /api/exchange-rates/sync
 * 从欧洲央行（ECB/Frankfurter）自动同步今日主要货币对人民币的汇率。
 * 三角计算：1 XXX = rates["CNY"] / rates["XXX"] CNY
 * 需要 OWNER 或 ADMIN 角色。
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });

  if (!membership) {
    return NextResponse.json({ error: "未找到成员信息" }, { status: 404 });
  }

  if (membership.role !== "OWNER" && membership.role !== "ADMIN") {
    return NextResponse.json({ error: "仅所有者或管理员可同步汇率" }, { status: 403 });
  }

  // 获取该组织下 ACTIVE 非 CNY 货币列表
  const activeCurrencies = await db.currency.findMany({
    where: { status: "ACTIVE", code: { not: "CNY" } },
    select: { code: true },
  });

  if (activeCurrencies.length === 0) {
    return NextResponse.json({ synced: 0, date: "", skipped: [], rates: [] });
  }

  // 从 Frankfurter 获取 ECB 汇率（EUR 为基准）
  let ecbData: FrankfurterResponse;
  try {
    const res = await fetch("https://api.frankfurter.app/latest?base=EUR", {
      headers: { Accept: "application/json" },
      // Next.js 15+ 默认不缓存，此处明确 no-store
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: `ECB 服务返回错误（HTTP ${res.status}），请稍后重试` },
        { status: 503 }
      );
    }
    ecbData = (await res.json()) as FrankfurterResponse;
  } catch {
    return NextResponse.json(
      { error: "无法连接 ECB 汇率服务，请检查网络后重试" },
      { status: 503 }
    );
  }

  const ecbRates = ecbData.rates;
  const ecbDate = ecbData.date; // "YYYY-MM-DD"

  // ECB 数据必须包含 CNY，否则三角计算无法进行
  if (!ecbRates["CNY"]) {
    return NextResponse.json(
      { error: "ECB 汇率数据中未包含人民币（CNY），同步中止" },
      { status: 500 }
    );
  }

  const cnyCentralRate = ecbRates["CNY"]; // EUR → CNY
  const effectiveDate = new Date(ecbDate);

  const synced: string[] = [];
  const skipped: string[] = [];

  for (const { code } of activeCurrencies) {
    // EUR 自身：EUR → CNY 直接使用
    // 其他货币：通过三角计算
    let rate: number;
    if (code === "EUR") {
      rate = cnyCentralRate;
    } else if (ecbRates[code] !== undefined) {
      rate = cnyCentralRate / ecbRates[code];
    } else {
      skipped.push(code);
      continue;
    }

    const rateStr = rate.toFixed(6);

    await db.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_rateType_effectiveDate: {
          fromCurrency: code,
          toCurrency: "CNY",
          rateType: "SPOT",
          effectiveDate,
        },
      },
      create: {
        fromCurrency: code,
        toCurrency: "CNY",
        rate: rateStr,
        rateType: "SPOT",
        effectiveDate,
        source: "ECB",
      },
      update: {
        rate: rateStr,
        source: "ECB",
      },
    });

    synced.push(code);
  }

  return NextResponse.json({
    synced: synced.length,
    date: ecbDate,
    syncedCurrencies: synced,
    skipped,
  });
}
