/**
 * 增值税汇总报表
 *
 * 按照增值税申报附列资料格式，汇总展示：
 *   Part 1 — 销项税额明细（按税率分列）
 *   Part 2 — 进项税额明细（可抵扣 vs 不可抵扣）
 *   Part 3 — 税款计算（应缴或留抵）
 *   Part 4 — 税金及附加（仅在应缴 > 0 时显示）
 *
 * 会计逻辑依据：增值税暂行条例及增值税申报表格式
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

/* ─── VAT invoice type display labels ─── */
const INVOICE_TYPE_LABELS: Record<string, string> = {
  SPECIAL_VAT:   "增值税专用发票",
  GENERAL_VAT:   "增值税普通发票",
  ELECTRONIC_VAT: "电子普通发票",
  TOLL_ROAD:     "通行费发票",
  OTHER:         "其他凭证",
};

/* ─── Helpers ─── */
function fmt(n: number): string {
  if (n === 0) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function fmtRate(r: number): string {
  // r is stored as a decimal, e.g. 0.13 → "13%"
  return (r * 100).toFixed(0) + "%";
}

interface SearchParams { periodId?: string; }

export default async function VATSummaryPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sp = await searchParams;

  /* ── Resolve company ── */
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: { companies: { where: { isActive: true }, take: 1 } },
      },
    },
  });
  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  /* ── Surtax rates: VATConfig → company.surtaxConfig → defaults ── */
  const vatConfig = await db.vATConfig.findUnique({ where: { companyId: company.id } });

  type SurtaxJSON = { urbanMaintenance?: number; educationSurcharge?: number; localEducation?: number };
  const surtaxJSON = (company.surtaxConfig as SurtaxJSON) ?? {};

  const urbanRate    = vatConfig ? Number(vatConfig.urbanMaintenanceRate)  : (surtaxJSON.urbanMaintenance   ?? 0.07);
  const eduRate      = vatConfig ? Number(vatConfig.educationSurcharge)    : (surtaxJSON.educationSurcharge ?? 0.03);
  const localEduRate = vatConfig ? Number(vatConfig.localEducation)        : (surtaxJSON.localEducation     ?? 0.02);

  /* ── Fiscal periods for selector ── */
  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true },
  });

  const today = new Date();
  const currentPeriod = periods.find(
    (p) => new Date(p.startDate) <= today && new Date(p.endDate) >= today
  ) ?? periods[0];
  const selectedPeriodId = sp.periodId ?? currentPeriod?.id ?? "";
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? periods[0];

  /* ── Fetch VAT records for selected period ── */
  const vatRecords = selectedPeriodId
    ? await db.vATRecord.findMany({
        where: { companyId: company.id, fiscalPeriodId: selectedPeriodId },
        select: {
          direction:   true,
          invoiceType: true,
          taxRate:     true,
          amount:      true,
          taxAmount:   true,
          deductible:  true,
        },
      })
    : [];

  /* ════════════════════════════════════════════════════════════════
     PART 1 — 销项税额  (SALES, grouped by taxRate)
  ════════════════════════════════════════════════════════════════ */
  type RateRow = { amount: number; taxAmount: number };

  const salesByRate = new Map<number, RateRow>();
  for (const r of vatRecords.filter((x) => x.direction === "SALES")) {
    const rate = Number(r.taxRate);
    const cur  = salesByRate.get(rate) ?? { amount: 0, taxAmount: 0 };
    salesByRate.set(rate, {
      amount:    cur.amount    + Number(r.amount),
      taxAmount: cur.taxAmount + Number(r.taxAmount),
    });
  }
  // Sort by descending tax rate
  const salesRows = Array.from(salesByRate.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, v]) => ({ rate, ...v }));
  const salesTotalAmount    = salesRows.reduce((s, r) => s + r.amount,    0);
  const salesTotalTaxAmount = salesRows.reduce((s, r) => s + r.taxAmount, 0);

  /* ════════════════════════════════════════════════════════════════
     PART 2 — 进项税额  (PURCHASE)
     2a: 可抵扣 (deductible=true), grouped by taxRate
     2b: 不可抵扣 (deductible=false), grouped by invoiceType
  ════════════════════════════════════════════════════════════════ */
  const purchDeductByRate = new Map<number, RateRow>();
  for (const r of vatRecords.filter((x) => x.direction === "PURCHASE" && x.deductible)) {
    const rate = Number(r.taxRate);
    const cur  = purchDeductByRate.get(rate) ?? { amount: 0, taxAmount: 0 };
    purchDeductByRate.set(rate, {
      amount:    cur.amount    + Number(r.amount),
      taxAmount: cur.taxAmount + Number(r.taxAmount),
    });
  }
  const deductRows = Array.from(purchDeductByRate.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([rate, v]) => ({ rate, ...v }));
  const deductTotalAmount    = deductRows.reduce((s, r) => s + r.amount,    0);
  const deductTotalTaxAmount = deductRows.reduce((s, r) => s + r.taxAmount, 0);

  const purchNonDeductByType = new Map<string, RateRow>();
  for (const r of vatRecords.filter((x) => x.direction === "PURCHASE" && !x.deductible)) {
    const type = r.invoiceType;
    const cur  = purchNonDeductByType.get(type) ?? { amount: 0, taxAmount: 0 };
    purchNonDeductByType.set(type, {
      amount:    cur.amount    + Number(r.amount),
      taxAmount: cur.taxAmount + Number(r.taxAmount),
    });
  }
  const nonDeductRows = Array.from(purchNonDeductByType.entries())
    .map(([type, v]) => ({ type, ...v }));
  const nonDeductTotalAmount    = nonDeductRows.reduce((s, r) => s + r.amount,    0);
  const nonDeductTotalTaxAmount = nonDeductRows.reduce((s, r) => s + r.taxAmount, 0);

  /* ════════════════════════════════════════════════════════════════
     PART 3 — 税款计算
  ════════════════════════════════════════════════════════════════ */
  const vatNet     = salesTotalTaxAmount - deductTotalTaxAmount;
  const vatPayable = Math.max(0, vatNet);          // 应缴增值税
  const vatCredit  = Math.max(0, -vatNet);         // 留抵税额

  /* ════════════════════════════════════════════════════════════════
     PART 4 — 税金及附加（仅当 vatPayable > 0）
  ════════════════════════════════════════════════════════════════ */
  const urbanTax    = vatPayable > 0 ? +(vatPayable * urbanRate).toFixed(2)    : 0;
  const eduTax      = vatPayable > 0 ? +(vatPayable * eduRate).toFixed(2)      : 0;
  const localEduTax = vatPayable > 0 ? +(vatPayable * localEduRate).toFixed(2) : 0;
  const totalSurtax = urbanTax + eduTax + localEduTax;
  const totalBurden = vatPayable + totalSurtax;

  const hasData = vatRecords.length > 0;

  /* ────────────────────────────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">增值税汇总报表</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          按税率分列展示进销项税额及附加税测算，供申报附表参考
        </p>
      </div>

      {/* Period selector */}
      <form method="GET" className="flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs font-medium mb-1">会计期间</label>
          <select
            name="periodId"
            defaultValue={selectedPeriodId}
            className="rounded-md border px-3 py-1.5 text-sm min-w-44"
          >
            {periods.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80"
        >
          查询
        </button>
        {selectedPeriod && (
          <span className="text-sm text-muted-foreground self-end pb-1.5">
            {company.name} · {selectedPeriod.name}
          </span>
        )}
      </form>

      {!hasData ? (
        <div className="text-center py-16 bg-white rounded-lg border border-dashed">
          <p className="text-muted-foreground">本期暂无增值税记录</p>
          <p className="text-sm text-muted-foreground mt-1">
            请先在进销项台账录入发票后再查看汇总报表
          </p>
        </div>
      ) : (
        <>
          {/* ══ PART 1: 销项税额明细 ══ */}
          <section>
            <div className="rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-blue-50">
                <h2 className="text-sm font-semibold text-blue-900">一、销项税额明细</h2>
                <p className="text-xs text-blue-700 mt-0.5">本期开出发票按税率分列</p>
              </div>
              {salesRows.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted-foreground">本期无销项记录</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">税率</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">不含税销售额</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">销项税额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {salesRows.map((row) => (
                      <tr key={row.rate} className="hover:bg-muted/10">
                        <td className="px-4 py-2 font-medium">{fmtRate(row.rate)}</td>
                        <td className="px-4 py-2 text-right font-mono">{fmt(row.amount)}</td>
                        <td className="px-4 py-2 text-right font-mono text-blue-700">{fmt(row.taxAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 bg-blue-50/50">
                    <tr className="font-semibold">
                      <td className="px-4 py-2.5">合计</td>
                      <td className="px-4 py-2.5 text-right font-mono">{fmt(salesTotalAmount)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-blue-800">{fmt(salesTotalTaxAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </section>

          {/* ══ PART 2: 进项税额明细 ══ */}
          <section>
            <div className="rounded-lg border overflow-hidden">
              <div className="px-4 py-3 border-b bg-green-50">
                <h2 className="text-sm font-semibold text-green-900">二、进项税额明细</h2>
                <p className="text-xs text-green-700 mt-0.5">本期取得发票按可抵扣性分列</p>
              </div>

              {/* 2a: 可抵扣 */}
              <div className="border-b">
                <div className="px-4 py-2 bg-green-50/40 text-xs font-semibold text-green-800 uppercase tracking-wide">
                  可抵扣进项税额（已认证）
                </div>
                {deductRows.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">本期无可抵扣进项</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/10 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">税率</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">不含税金额</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">可抵扣进项税额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {deductRows.map((row) => (
                        <tr key={row.rate} className="hover:bg-muted/10">
                          <td className="px-4 py-2 font-medium">{fmtRate(row.rate)}</td>
                          <td className="px-4 py-2 text-right font-mono">{fmt(row.amount)}</td>
                          <td className="px-4 py-2 text-right font-mono text-green-700">{fmt(row.taxAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-green-50/30">
                      <tr className="font-semibold text-sm">
                        <td className="px-4 py-2">可抵扣小计</td>
                        <td className="px-4 py-2 text-right font-mono">{fmt(deductTotalAmount)}</td>
                        <td className="px-4 py-2 text-right font-mono text-green-800">{fmt(deductTotalTaxAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* 2b: 不可抵扣 */}
              <div>
                <div className="px-4 py-2 bg-orange-50/40 text-xs font-semibold text-orange-800 uppercase tracking-wide">
                  不可抵扣进项税额（未认证 / 不符合抵扣条件）
                </div>
                {nonDeductRows.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">本期无不可抵扣进项</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/10 border-b">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium text-muted-foreground">发票类型</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">不含税金额</th>
                        <th className="px-4 py-2 text-right font-medium text-muted-foreground">不可抵扣税额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {nonDeductRows.map((row) => (
                        <tr key={row.type} className="hover:bg-muted/10">
                          <td className="px-4 py-2">{INVOICE_TYPE_LABELS[row.type] ?? row.type}</td>
                          <td className="px-4 py-2 text-right font-mono">{fmt(row.amount)}</td>
                          <td className="px-4 py-2 text-right font-mono text-orange-600">{fmt(row.taxAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t bg-orange-50/30">
                      <tr className="font-semibold text-sm">
                        <td className="px-4 py-2">不可抵扣小计</td>
                        <td className="px-4 py-2 text-right font-mono">{fmt(nonDeductTotalAmount)}</td>
                        <td className="px-4 py-2 text-right font-mono text-orange-700">{fmt(nonDeductTotalTaxAmount)}</td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </section>

          {/* ══ PART 3: 税款计算 ══ */}
          <section>
            <div className={`rounded-lg border overflow-hidden ${vatPayable > 0 ? "border-red-200" : vatCredit > 0 ? "border-green-200" : "border-border"}`}>
              <div className={`px-4 py-3 border-b ${vatPayable > 0 ? "bg-red-50" : vatCredit > 0 ? "bg-green-50" : "bg-muted/30"}`}>
                <h2 className={`text-sm font-semibold ${vatPayable > 0 ? "text-red-900" : "text-green-900"}`}>
                  三、税款计算
                </h2>
              </div>
              <div className="divide-y">
                <div className="grid grid-cols-2 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">① 销项税额合计</span>
                  <span className="text-right font-mono font-medium text-blue-700">{fmt(salesTotalTaxAmount)}</span>
                </div>
                <div className="grid grid-cols-2 px-4 py-3 text-sm">
                  <span className="text-muted-foreground">② 可抵扣进项税额合计</span>
                  <span className="text-right font-mono font-medium text-green-700">({fmt(deductTotalTaxAmount)})</span>
                </div>
                {nonDeductTotalTaxAmount > 0 && (
                  <div className="grid grid-cols-2 px-4 py-3 text-sm bg-orange-50/30">
                    <span className="text-muted-foreground pl-6">其中：不可抵扣进项税额（不参与计算）</span>
                    <span className="text-right font-mono text-orange-600">{fmt(nonDeductTotalTaxAmount)}</span>
                  </div>
                )}
                <div className={`grid grid-cols-2 px-4 py-3 border-t-2 ${vatPayable > 0 ? "bg-red-50" : "bg-green-50"}`}>
                  <span className={`font-bold text-sm ${vatPayable > 0 ? "text-red-800" : "text-green-800"}`}>
                    {vatPayable > 0
                      ? "③ 应缴增值税（① - ②，本期应纳税额）"
                      : "③ 留抵税额（② - ①，结转下期抵扣）"}
                  </span>
                  <span className={`text-right font-mono font-bold text-lg ${vatPayable > 0 ? "text-red-700" : "text-green-700"}`}>
                    {fmt(vatPayable > 0 ? vatPayable : vatCredit)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ══ PART 4: 税金及附加 ══ */}
          <section>
            {vatPayable > 0 ? (
              <div className="rounded-lg border border-orange-200 overflow-hidden">
                <div className="px-4 py-3 border-b bg-orange-50">
                  <h2 className="text-sm font-semibold text-orange-900">四、税金及附加（基于应缴增值税）</h2>
                  <p className="text-xs text-orange-700 mt-0.5">
                    计税依据 = 应缴增值税 {fmt(vatPayable)}；税率来源：{vatConfig ? "增值税配置" : "公司附加税配置/默认"}
                  </p>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/20 border-b">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-muted-foreground">税种</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">税率</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">计税基数</th>
                      <th className="px-4 py-2.5 text-right font-medium text-muted-foreground">应缴金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2">城市维护建设税</td>
                      <td className="px-4 py-2 text-right font-mono">{(urbanRate * 100).toFixed(0)}%</td>
                      <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmt(vatPayable)}</td>
                      <td className="px-4 py-2 text-right font-mono text-orange-600">{fmt(urbanTax)}</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2">教育费附加</td>
                      <td className="px-4 py-2 text-right font-mono">{(eduRate * 100).toFixed(0)}%</td>
                      <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmt(vatPayable)}</td>
                      <td className="px-4 py-2 text-right font-mono text-orange-600">{fmt(eduTax)}</td>
                    </tr>
                    <tr className="hover:bg-muted/10">
                      <td className="px-4 py-2">地方教育附加</td>
                      <td className="px-4 py-2 text-right font-mono">{(localEduRate * 100).toFixed(0)}%</td>
                      <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmt(vatPayable)}</td>
                      <td className="px-4 py-2 text-right font-mono text-orange-600">{fmt(localEduTax)}</td>
                    </tr>
                  </tbody>
                  <tfoot className="border-t-2">
                    <tr className="font-semibold bg-orange-50/50">
                      <td className="px-4 py-2.5" colSpan={3}>税金及附加合计</td>
                      <td className="px-4 py-2.5 text-right font-mono text-orange-700">{fmt(totalSurtax)}</td>
                    </tr>
                    <tr className="font-bold bg-red-50/50 border-t">
                      <td className="px-4 py-3 text-red-800" colSpan={3}>
                        本期综合税费负担合计（增值税 + 税金及附加）
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-red-700 text-base">{fmt(totalBurden)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="rounded-lg border bg-green-50 border-green-200 p-4 text-sm text-green-800">
                <p className="font-medium">四、税金及附加</p>
                <p className="mt-1 text-green-700">
                  {vatCredit > 0
                    ? `本期进项税额大于销项税额，留抵税额 ${fmt(vatCredit)}，无应缴增值税，无需计算城建税及附加税。`
                    : "本期销项与进项税额相抵后为零，无应缴增值税，无需计算城建税及附加税。"}
                </p>
              </div>
            )}
          </section>

          {/* Footer note */}
          <p className="text-xs text-muted-foreground">
            * 本报表基于本期增值税台账记录汇总，仅供申报参考。实际申报以主管税务机关申报系统为准。
            附加税税率默认值：城建税7%（市区）/ 教育费附加3% / 地方教育附加2%，请按实际税务登记地适用税率调整。
          </p>
        </>
      )}
    </div>
  );
}
