import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { JournalEntryForm } from "../journal-entry-form";

export default async function NewJournalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

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

  // 找当前月份对应的期间（优先 OPEN，其次任意）
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
      />
    </div>
  );
}
