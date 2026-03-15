/**
 * 合并现金流量表（CAS 31）
 *
 * 将合并范围内（FULL合并方法）所有成员公司的现金及现金等价物
 * 流入/流出汇总，按经营/投资/融资三大活动分类展示。
 *
 * 与单公司现金流量表的区别：
 * - 跨多家公司聚合凭证行
 * - 期初/期末余额取合并范围内所有成员现金科目余额之和
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Decimal } from "@prisma/client/runtime/library";
import {
  loadGroupInfo,
  type ConsolidationMemberInfo,
} from "@/lib/consolidation-utils";

// ── 现金科目编码（1001 库存现金，1002 银行存款）──
const CASH_CODES = ["1001", "1002"];
function isCash(code: string) {
  return CASH_CODES.some((c) => code === c || code.startsWith(c + "."));
}

// ── 根据对方科目自动推断活动分类（与单公司版本相同）──
function inferActivity(
  counterparts: { accountType: string; reportCategory: string | null }[]
): "OPERATING" | "INVESTING" | "FINANCING" {
  for (const c of counterparts) {
    if (c.accountType === "REVENUE") return "OPERATING";
    if (c.accountType === "EXPENSE") return "OPERATING";
    if (c.reportCategory === "NON_CURRENT_ASSET") return "INVESTING";
    if (c.accountType === "LIABILITY") return "FINANCING";
    if (c.accountType === "EQUITY") return "FINANCING";
  }
  return "OPERATING";
}

function toNum(d: Decimal | null | undefined): number {
  if (!d) return 0;
  return parseFloat(d.toString());
}

type Activity = "OPERATING" | "INVESTING" | "FINANCING";

interface CashItem {
  entryNumber:    string;
  description:    string;
  companyName:    string;
  counterpart:    string;
  activity:       Activity;
  isAuto:         boolean;
  amount:         number;   // 正=流入，负=流出
}

const ACTIVITY_LABELS: Record<Activity, string> = {
  OPERATING:  "经营活动",
  INVESTING:  "投资活动",
  FINANCING:  "筹资活动",
};

const ACTIVITY_ORDER: Activity[] = ["OPERATING", "INVESTING", "FINANCING"];

interface SearchParams { year?: string; month?: string; }

export default async function ConsolidatedCashFlowPage({
  params,
  searchParams,
}: {
  params:       Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id: groupId } = await params;
  const sp = await searchParams;

  const group = await loadGroupInfo(groupId);
  if (!group) notFound();

  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId: group.organization.id, userId: session.user.id },
  });
  if (!orgMember) redirect("/dashboard");

  const now   = new Date();
  const year  = parseInt(sp.year  ?? String(now.getFullYear()));
  const month = parseInt(sp.month ?? String(now.getMonth() + 1));

  const members: ConsolidationMemberInfo[] = group.members.map((m) => ({
    id:                    m.id,
    companyId:             m.companyId,
    companyName:           m.company.name,
    memberType:            m.memberType,
    ownershipPct:          Number(m.ownershipPct),
    consolidationMethod:   m.consolidationMethod,
    investmentAccountCode: m.investmentAccountCode,
  }));

  const fullMembers = members.filter(
    (m) => m.consolidationMethod === "FULL" || m.memberType === "PARENT"
  );

  const companyIds = fullMembers.map((m) => m.companyId);
  const companyNameMap = new Map(fullMembers.map((m) => [m.companyId, m.companyName]));

  // ── 获取所有成员公司的全部会计期间（用于期初/YTD 计算）──
  const allPeriods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: { in: companyIds } } },
    include: { fiscalYear: { select: { year: true } } },
    orderBy: [{ fiscalYear: { year: "asc" } }, { periodNumber: "asc" }],
  });

  const availableYears = await db.fiscalYear.findMany({
    where: { companyId: { in: companyIds } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  }).then((rows) => rows.map((r) => r.year));

  const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

  // ── 期初余额：目标财年之前所有已过账凭证对现金科目净影响 ──
  let openingBalance = 0;
  const cashItems: CashItem[] = [];

  const priorPeriodIds = allPeriods
    .filter((p) => p.fiscalYear.year < year)
    .map((p) => p.id);

  if (priorPeriodIds.length > 0) {
    const priorLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId:      { in: companyIds },
          fiscalPeriodId: { in: priorPeriodIds },
          status:         "POSTED",
        },
        account: { code: { in: CASH_CODES } },
      },
      select: { debitAmountLC: true, creditAmountLC: true },
    });
    for (const l of priorLines) {
      openingBalance += toNum(l.debitAmountLC) - toNum(l.creditAmountLC);
    }
  }

  // ── YTD 凭证：本财年内 periodNumber <= month ──
  const ytdPeriodIds = allPeriods
    .filter((p) => p.fiscalYear.year === year && p.periodNumber <= month)
    .map((p) => p.id);

  if (ytdPeriodIds.length > 0) {
    const entries = await db.journalEntry.findMany({
      where: {
        companyId:      { in: companyIds },
        fiscalPeriodId: { in: ytdPeriodIds },
        status:         "POSTED",
      },
      select: {
        id:            true,
        entryNumber:   true,
        description:   true,
        companyId:     true,
        lines: {
          select: {
            cashFlowActivity: true,
            debitAmountLC:    true,
            creditAmountLC:   true,
            account: {
              select: {
                code:           true,
                name:           true,
                accountType:    true,
                reportCategory: true,
              },
            },
          },
        },
      },
    });

    for (const entry of entries) {
      const cashLines    = entry.lines.filter((l) => isCash(l.account.code));
      const nonCashLines = entry.lines.filter((l) => !isCash(l.account.code));
      if (cashLines.length === 0) continue;

      for (const cashLine of cashLines) {
        const inflow  = toNum(cashLine.debitAmountLC);
        const outflow = toNum(cashLine.creditAmountLC);
        if (inflow === 0 && outflow === 0) continue;

        const amount = inflow - outflow;

        let activity: Activity;
        let isAuto: boolean;

        if (cashLine.cashFlowActivity) {
          activity = cashLine.cashFlowActivity as Activity;
          isAuto   = false;
        } else {
          activity = inferActivity(
            nonCashLines.map((l) => ({
              accountType:    l.account.accountType,
              reportCategory: l.account.reportCategory,
            }))
          );
          isAuto = true;
        }

        const counterpart = nonCashLines
          .map((l) => l.account.name)
          .filter((v, i, a) => a.indexOf(v) === i)
          .join("、");

        cashItems.push({
          entryNumber: entry.entryNumber,
          description: entry.description ?? "",
          companyName: companyNameMap.get(entry.companyId) ?? "",
          counterpart,
          activity,
          isAuto,
          amount,
        });
      }
    }
  }

  // ── 计算各活动净额 ──
  const netByActivity = (act: Activity) =>
    cashItems.filter((i) => i.activity === act).reduce((s, i) => s + i.amount, 0);

  const netOperating  = netByActivity("OPERATING");
  const netInvesting  = netByActivity("INVESTING");
  const netFinancing  = netByActivity("FINANCING");
  const netTotal      = netOperating + netInvesting + netFinancing;
  const closingBalance = openingBalance + netTotal;

  const hasData = cashItems.length > 0;

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const netCls = (n: number) =>
    n < 0 ? "text-red-600 font-mono" : "font-mono";

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Link href="/consolidation" className="text-sm text-muted-foreground hover:text-foreground">合并报表</Link>
          <span className="text-muted-foreground">/</span>
          <Link href={`/consolidation/${groupId}`} className="text-sm text-muted-foreground hover:text-foreground">{group.name}</Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-sm font-medium">合并现金流量表</span>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">合并现金流量表</h1>
          <button
            onClick={() => typeof window !== "undefined" && window.print()}
            className="no-print rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >打印</button>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {group.name} · {year}年1–{month}月（累计） · 合并范围：{fullMembers.map((m) => m.companyName).join("、")}
        </p>
      </div>

      {/* Filters */}
      <form method="GET" className="no-print flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs font-medium mb-1">年度</label>
          <select name="year" defaultValue={year} className="rounded-md border px-3 py-1.5 text-sm">
            {availableYears.map((y) => <option key={y} value={y}>{y}年</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">截至期间</label>
          <select name="month" defaultValue={month} className="rounded-md border px-3 py-1.5 text-sm">
            {MONTHS.map((m) => <option key={m} value={m}>{m}月</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">查询</button>
      </form>

      {fullMembers.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          尚未添加成员公司，请先
          <Link href={`/consolidation/${groupId}`} className="text-primary hover:underline mx-1">配置合并组</Link>
        </div>
      ) : !hasData ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          所选期间暂无已过账凭证涉及现金科目（1001/1002）
        </div>
      ) : (
        <>
          {/* Three activities */}
          {ACTIVITY_ORDER.map((act) => {
            const items    = cashItems.filter((i) => i.activity === act);
            const inflows  = items.filter((i) => i.amount >= 0);
            const outflows = items.filter((i) => i.amount < 0);
            const net      = items.reduce((s, i) => s + i.amount, 0);

            return (
              <div key={act} className="bg-white border rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-muted/30 border-b">
                  <h2 className="text-sm font-semibold">{ACTIVITY_LABELS[act]}现金流量</h2>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-muted/10 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">凭证</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground">摘要 / 对方科目</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">成员公司</th>
                      <th className="px-4 py-2 text-right font-medium text-muted-foreground">金额</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inflows.length > 0 && (
                      <tr className="bg-green-50/50">
                        <td colSpan={4} className="px-4 py-1 text-xs font-semibold text-green-700">▲ 现金流入</td>
                      </tr>
                    )}
                    {inflows.map((item, i) => (
                      <tr key={`in-${i}`} className="border-b hover:bg-muted/10">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.entryNumber}</td>
                        <td className="px-4 py-2">
                          <div>{item.description || item.counterpart || "—"}</div>
                          {item.counterpart && item.description && (
                            <div className="text-xs text-muted-foreground">{item.counterpart}</div>
                          )}
                          {item.isAuto && (
                            <span className="text-xs text-amber-600">（自动分类）</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{item.companyName}</td>
                        <td className="px-4 py-2 text-right font-mono text-green-700">{fmt(item.amount)}</td>
                      </tr>
                    ))}

                    {outflows.length > 0 && (
                      <tr className="bg-red-50/50">
                        <td colSpan={4} className="px-4 py-1 text-xs font-semibold text-red-700">▼ 现金流出</td>
                      </tr>
                    )}
                    {outflows.map((item, i) => (
                      <tr key={`out-${i}`} className="border-b hover:bg-muted/10">
                        <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.entryNumber}</td>
                        <td className="px-4 py-2">
                          <div>{item.description || item.counterpart || "—"}</div>
                          {item.counterpart && item.description && (
                            <div className="text-xs text-muted-foreground">{item.counterpart}</div>
                          )}
                          {item.isAuto && (
                            <span className="text-xs text-amber-600">（自动分类）</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{item.companyName}</td>
                        <td className="px-4 py-2 text-right font-mono text-red-600">({fmt(-item.amount)})</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-muted/20 border-t-2">
                    <tr className="font-semibold">
                      <td colSpan={3} className="px-4 py-2 text-sm">{ACTIVITY_LABELS[act]}现金流量净额</td>
                      <td className={`px-4 py-2 text-right ${netCls(net)}`}>{net < 0 ? `(${fmt(-net)})` : fmt(net)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })}

          {/* Summary */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-muted/30 border-b">
              <h2 className="text-sm font-semibold">现金及现金等价物变动汇总</h2>
            </div>
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b hover:bg-muted/10">
                  <td className="px-4 py-2">一、经营活动产生的现金流量净额</td>
                  <td className={`px-4 py-2 text-right ${netCls(netOperating)}`}>
                    {netOperating < 0 ? `(${fmt(-netOperating)})` : fmt(netOperating)}
                  </td>
                </tr>
                <tr className="border-b hover:bg-muted/10">
                  <td className="px-4 py-2">二、投资活动产生的现金流量净额</td>
                  <td className={`px-4 py-2 text-right ${netCls(netInvesting)}`}>
                    {netInvesting < 0 ? `(${fmt(-netInvesting)})` : fmt(netInvesting)}
                  </td>
                </tr>
                <tr className="border-b hover:bg-muted/10">
                  <td className="px-4 py-2">三、筹资活动产生的现金流量净额</td>
                  <td className={`px-4 py-2 text-right ${netCls(netFinancing)}`}>
                    {netFinancing < 0 ? `(${fmt(-netFinancing)})` : fmt(netFinancing)}
                  </td>
                </tr>
                <tr className="border-b bg-muted/10 font-semibold">
                  <td className="px-4 py-2">四、现金及现金等价物净增加（减少）额</td>
                  <td className={`px-4 py-2 text-right ${netCls(netTotal)}`}>
                    {netTotal < 0 ? `(${fmt(-netTotal)})` : fmt(netTotal)}
                  </td>
                </tr>
                <tr className="border-b hover:bg-muted/10">
                  <td className="px-4 py-2 pl-8 text-muted-foreground">加：期初现金及现金等价物余额</td>
                  <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmt(openingBalance)}</td>
                </tr>
                <tr className="bg-primary/5">
                  <td className="px-4 py-3 font-bold">五、期末现金及现金等价物余额</td>
                  <td className={`px-4 py-3 text-right font-bold font-mono ${closingBalance < 0 ? "text-red-600" : ""}`}>
                    {fmt(closingBalance)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Notes */}
      <div className="no-print rounded-lg border bg-amber-50 border-amber-200 p-4 text-xs text-amber-800">
        <strong>注意：</strong>合并现金流量表仅包含全额合并（FULL）成员公司的现金流数据。
        内部往来现金流（如成员间借款、内部资金调拨）已通过 <code>isIntercompany</code> 标记区分，
        但尚未自动消除——请在录入凭证时正确标记内部交易，并手动核对内部往来是否已抵消。
        现金流分类以凭证行上明确设置的 <code>cashFlowActivity</code> 为准，未设置时由系统按对方科目类型自动推断。
      </div>
    </div>
  );
}
