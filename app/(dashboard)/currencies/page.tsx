import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { CurrenciesClient } from "./currencies-client";

export default async function CurrenciesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currencies = await db.currency.findMany({
    orderBy: { code: "asc" },
  });

  const exchangeRates = await db.exchangeRate.findMany({
    where: { toCurrency: "CNY" },
    orderBy: [{ fromCurrency: "asc" }, { effectiveDate: "desc" }],
    take: 200,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">货币与汇率</h1>
        <p className="text-muted-foreground mt-1">管理支持的货币和汇率数据</p>
      </div>
      <CurrenciesClient
        currencies={currencies}
        exchangeRates={exchangeRates.map((r) => ({ ...r, rate: r.rate.toString() }))}
      />
    </div>
  );
}
