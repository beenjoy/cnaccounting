import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { VATDeclarationActions } from "./vat-declaration-actions";

interface SearchParams { periodId?: string; companyId?: string; }

export default async function VATDeclarationPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sp = await searchParams;

  // Get org membership
  const member = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, orderBy: { name: "asc" } } } } },
  });
  if (!member) redirect("/onboarding");

  const companies = member.organization.companies;
  if (companies.length === 0) redirect("/onboarding");

  const selectedCompanyId = sp.companyId ?? companies[0]!.id;
  const company = companies.find((c) => c.id === selectedCompanyId) ?? companies[0]!;

  const canEdit = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role);

  // Load fiscal periods (ordered by startDate desc)
  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });

  // Default to current month period
  const today = new Date();
  const currentPeriod = periods.find(
    (p) => p.startDate <= today && p.endDate >= today
  ) ?? periods[0];
  const selectedPeriodId = sp.periodId ?? currentPeriod?.id ?? "";
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? periods[0];

  // Aggregate VAT records for the selected period
  const vatRecords = selectedPeriodId
    ? await db.vATRecord.findMany({
        where: { companyId: company.id, fiscalPeriodId: selectedPeriodId },
        select: { direction: true, taxAmount: true, deductible: true, amount: true },
      })
    : [];

  const salesTax = vatRecords
    .filter((r) => r.direction === "SALES")
    .reduce((s, r) => s + Number(r.taxAmount), 0);
  const salesAmount = vatRecords
    .filter((r) => r.direction === "SALES")
    .reduce((s, r) => s + Number(r.amount), 0);

  const deductiblePurchaseTax = vatRecords
    .filter((r) => r.direction === "PURCHASE" && r.deductible)
    .reduce((s, r) => s + Number(r.taxAmount), 0);
  const nonDeductiblePurchaseTax = vatRecords
    .filter((r) => r.direction === "PURCHASE" && !r.deductible)
    .reduce((s, r) => s + Number(r.taxAmount), 0);
  const purchaseAmount = vatRecords
    .filter((r) => r.direction === "PURCHASE")
    .reduce((s, r) => s + Number(r.amount), 0);

  const vatPayable = salesTax - deductiblePurchaseTax;

  type SurtaxConfig = { urbanMaintenance?: number; educationSurcharge?: number; localEducation?: number };
  const surtaxConfig = (company.surtaxConfig as SurtaxConfig) ?? {};
  const urbanRate = surtaxConfig.urbanMaintenance ?? 0.07;
  const eduRate = surtaxConfig.educationSurcharge ?? 0.03;
  const localEduRate = surtaxConfig.localEducation ?? 0.02;

  const urbanTax = vatPayable > 0 ? +(vatPayable * urbanRate).toFixed(2) : 0;
  const eduTax = vatPayable > 0 ? +(vatPayable * eduRate).toFixed(2) : 0;
  const localEduTax = vatPayable > 0 ? +(vatPayable * localEduRate).toFixed(2) : 0;
  const totalSurtax = urbanTax + eduTax + localEduTax;
  const totalTaxBurden = Math.max(vatPayable, 0) + totalSurtax;

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">增值税申报表</h1>
          <p className="text-sm text-muted-foreground mt-1">月度增值税汇总与结转凭证生成</p>
        </div>
        <Link href="/vat/records" className="text-sm text-primary hover:underline">← 进销项台账</Link>
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
        {companies.length > 1 && (
          <div>
            <label className="block text-xs font-medium mb-1">公司</label>
            <select name="companyId" defaultValue={company.id}
              className="rounded-md border px-3 py-1.5 text-sm min-w-32">
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1">会计期间</label>
          <select name="periodId" defaultValue={selectedPeriodId}
            className="rounded-md border px-3 py-1.5 text-sm min-w-40">
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">
          查询
        </button>
      </form>

      {vatRecords.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground bg-white rounded-lg border">
          <p className="text-lg font-medium">本期暂无增值税记录</p>
          <p className="text-sm mt-1">请先在<Link href="/vat/records" className="text-primary hover:underline mx-1">进销项台账</Link>录入发票</p>
        </div>
      ) : (
        <>
          {/* Declaration Table */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-6 py-4 border-b bg-muted/30">
              <h2 className="text-base font-semibold">
                {company.name} — {selectedPeriod?.name} 增值税申报汇总
              </h2>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/20 border-b">
                <tr>
                  <th className="px-6 py-3 text-left font-medium text-muted-foreground">项目</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">不含税金额</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">税额</th>
                  <th className="px-6 py-3 text-right font-medium text-muted-foreground">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {/* Sales */}
                <tr className="bg-blue-50/40">
                  <td className="px-6 py-3 font-medium text-blue-700">一、销项税额（应税销售额）</td>
                  <td className="px-6 py-3 text-right font-mono">{fmt(salesAmount)}</td>
                  <td className="px-6 py-3 text-right font-mono font-medium text-blue-700">{fmt(salesTax)}</td>
                  <td className="px-6 py-3 text-right text-muted-foreground text-xs">本期开出发票汇总</td>
                </tr>
                {/* Purchase deductible */}
                <tr className="bg-green-50/40">
                  <td className="px-6 py-3 font-medium text-green-700">二、进项税额（可抵扣）</td>
                  <td className="px-6 py-3 text-right font-mono">{fmt(purchaseAmount)}</td>
                  <td className="px-6 py-3 text-right font-mono font-medium text-green-700">({fmt(deductiblePurchaseTax)})</td>
                  <td className="px-6 py-3 text-right text-muted-foreground text-xs">已认证可抵扣</td>
                </tr>
                {/* Non-deductible */}
                {nonDeductiblePurchaseTax > 0 && (
                  <tr>
                    <td className="px-6 py-3 text-muted-foreground pl-10">其中：不可抵扣进项税额</td>
                    <td className="px-6 py-3 text-right font-mono text-muted-foreground">—</td>
                    <td className="px-6 py-3 text-right font-mono text-muted-foreground">{fmt(nonDeductiblePurchaseTax)}</td>
                    <td className="px-6 py-3 text-right text-muted-foreground text-xs">未认证/不可抵扣</td>
                  </tr>
                )}
                {/* VAT payable */}
                <tr className="border-t-2 border-border">
                  <td className="px-6 py-3 font-semibold">
                    {vatPayable >= 0 ? "三、应缴增值税（①−②）" : "三、留抵税额（②−①）"}
                  </td>
                  <td className="px-6 py-3 text-right">—</td>
                  <td className={`px-6 py-3 text-right font-mono font-bold ${vatPayable >= 0 ? "text-red-600" : "text-green-600"}`}>
                    {fmt(Math.abs(vatPayable))}
                  </td>
                  <td className="px-6 py-3 text-right text-xs">
                    {vatPayable >= 0 ? "本期应缴纳" : "结转下期留抵"}
                  </td>
                </tr>

                {vatPayable > 0 && (
                  <>
                    {/* Urban maintenance tax */}
                    <tr className="bg-orange-50/30">
                      <td className="px-6 py-3 text-muted-foreground pl-10">城市维护建设税（{(urbanRate * 100).toFixed(0)}%）</td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">{fmt(vatPayable)}</td>
                      <td className="px-6 py-3 text-right font-mono text-orange-600">{fmt(urbanTax)}</td>
                      <td className="px-6 py-3 text-right text-xs text-muted-foreground">税金及附加</td>
                    </tr>
                    <tr className="bg-orange-50/30">
                      <td className="px-6 py-3 text-muted-foreground pl-10">教育费附加（{(eduRate * 100).toFixed(0)}%）</td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">{fmt(vatPayable)}</td>
                      <td className="px-6 py-3 text-right font-mono text-orange-600">{fmt(eduTax)}</td>
                      <td className="px-6 py-3 text-right text-xs text-muted-foreground">税金及附加</td>
                    </tr>
                    <tr className="bg-orange-50/30">
                      <td className="px-6 py-3 text-muted-foreground pl-10">地方教育附加（{(localEduRate * 100).toFixed(0)}%）</td>
                      <td className="px-6 py-3 text-right font-mono text-muted-foreground">{fmt(vatPayable)}</td>
                      <td className="px-6 py-3 text-right font-mono text-orange-600">{fmt(localEduTax)}</td>
                      <td className="px-6 py-3 text-right text-xs text-muted-foreground">税金及附加</td>
                    </tr>
                    <tr className="border-t bg-orange-50/50">
                      <td className="px-6 py-3 font-semibold">四、税金及附加合计</td>
                      <td className="px-6 py-3 text-right">—</td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-orange-600">{fmt(totalSurtax)}</td>
                      <td className="px-6 py-3 text-right text-xs">城建+教附+地附</td>
                    </tr>
                    <tr className="border-t-2 bg-red-50/30">
                      <td className="px-6 py-3 font-bold text-red-700">合计应缴税费（含附加）</td>
                      <td className="px-6 py-3 text-right">—</td>
                      <td className="px-6 py-3 text-right font-mono font-bold text-red-700">{fmt(totalTaxBurden)}</td>
                      <td className="px-6 py-3 text-right text-xs text-red-600">本期税务负担合计</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* Action Section */}
          {canEdit && selectedPeriod && (
            <div className="bg-white border rounded-lg p-6">
              <h3 className="text-base font-semibold mb-2">生成结转凭证</h3>
              <p className="text-sm text-muted-foreground mb-4">
                点击下方按钮将自动生成增值税结转日记账凭证（草稿状态），包含销项/进项税额结转及应缴税额，
                {vatPayable > 0 && "以及税金及附加计提分录。"}
                生成后请前往凭证列表提交审批。
              </p>
              {selectedPeriod.status === "CLOSED" ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-4 py-2">
                  ⚠ 该期间已关闭，无法生成结转凭证
                </p>
              ) : (
                <VATDeclarationActions
                  companyId={company.id}
                  fiscalPeriodId={selectedPeriodId}
                  periodName={selectedPeriod.name}
                  salesTax={salesTax}
                  vatPayable={vatPayable}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
