import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { JournalEntryForm } from "../journal-entry-form";

export default async function NewJournalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true } } } } },
  });

  const companies = membership?.organization.companies ?? [];
  const company = companies[0];
  if (!company) redirect("/settings/companies");

  // 同集团其他公司（供内部交易标记）
  const siblingCompanies = companies
    .filter((c) => c.id !== company.id)
    .map((c) => ({ id: c.id, name: c.name, code: c.code }));

  // 获取所有期间（含已关闭，供日期匹配和状态提示）
  const openPeriods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id, isClosed: false } },
    include: { fiscalYear: true },
    orderBy: [{ fiscalYear: { year: "asc" } }, { periodNumber: "asc" }],
  });

  // 获取末级科目（可记账的科目）
  const accounts = await db.chartOfAccount.findMany({
    where: { companyId: company.id, isLeaf: true, isActive: true },
    orderBy: { code: "asc" },
  });

  // 获取货币列表
  const currencies = await db.currency.findMany({
    where: { status: "ACTIVE" },
    orderBy: { code: "asc" },
  });

  // 获取最新汇率
  const latestRates = await db.exchangeRate.findMany({
    where: { toCurrency: company.functionalCurrency },
    orderBy: { effectiveDate: "desc" },
  });
  const exchangeRateMap: Record<string, string> = {};
  for (const r of latestRates) {
    if (!exchangeRateMap[r.fromCurrency]) {
      exchangeRateMap[r.fromCurrency] = r.rate.toString();
    }
  }

  // 凭证模板（当前公司）
  const templates = await db.journalTemplate.findMany({
    where: { companyId: company.id, isActive: true },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  // 找当前月份对应的期间
  const now = new Date();
  const currentPeriod = openPeriods.find(
    (p) =>
      p.fiscalYear.year === now.getFullYear() &&
      p.periodNumber === now.getMonth() + 1 &&
      p.status === "OPEN"
  ) ?? openPeriods.find(
    (p) => p.fiscalYear.year === now.getFullYear() && p.periodNumber === now.getMonth() + 1
  );
  const defaultPeriodId = currentPeriod?.id ?? openPeriods.find((p) => p.status === "OPEN")?.id ?? openPeriods[0]?.id;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">新建凭证</h1>
        <p className="text-muted-foreground mt-1">录入日记账凭证，借贷双方必须平衡</p>
      </div>
      <JournalEntryForm
        companyId={company.id}
        defaultPeriodId={defaultPeriodId}
        openPeriods={openPeriods.map((p) => ({
          id: p.id,
          name: p.name,
          year: p.fiscalYear.year,
          periodNumber: p.periodNumber,
          status: p.status as "OPEN" | "CLOSED",
        }))}
        accounts={accounts.map((a) => ({
          id: a.id,
          code: a.code,
          name: a.name,
          accountType: a.accountType,
          normalBalance: a.normalBalance,
        }))}
        currencies={currencies.map((c) => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
        }))}
        exchangeRates={exchangeRateMap}
        functionalCurrency={company.functionalCurrency}
        siblingCompanies={siblingCompanies}
        templates={templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          lines: t.lines.map((l) => ({
            lineNumber: l.lineNumber,
            accountCode: l.accountCode,
            accountName: l.accountName,
            direction: l.direction,
            description: l.description,
          })),
        }))}
      />
    </div>
  );
}
