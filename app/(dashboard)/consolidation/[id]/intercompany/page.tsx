/**
 * 内部交易核对页面
 *
 * 展示集团内所有标记为 isIntercompany=true 的已过账凭证行，
 * 按公司对（A↔B）分组，自动判断匹配状态。
 */
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { loadGroupInfo } from "@/lib/consolidation-utils";

interface SearchParams { year?: string; }

/** 匹配判断：同公司对、日期差 ≤ 7天、金额差 ≤ 1% */
function isMatched(
  a: { amount: number; entryDate: Date },
  b: { amount: number; entryDate: Date }
): boolean {
  const dayDiff = Math.abs(a.entryDate.getTime() - b.entryDate.getTime()) / 86400000;
  if (dayDiff > 7) return false;
  const sumAbs = Math.abs(a.amount) + Math.abs(b.amount);
  if (sumAbs === 0) return true;
  const diff = Math.abs(Math.abs(a.amount) - Math.abs(b.amount));
  return diff / sumAbs <= 0.01;
}

export default async function IntercompanyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
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

  const now = new Date();
  const year = parseInt(sp.year ?? String(now.getFullYear()));

  const companyIds = group.members.map((m) => m.companyId);
  const companyMap = new Map(group.members.map((m) => [m.companyId, m.company.name]));

  // 查询当年所有内部交易凭证行（已过账）
  const icLines = await db.journalEntryLine.findMany({
    where: {
      isIntercompany: true,
      journalEntry: {
        companyId: { in: companyIds },
        status: "POSTED",
        fiscalPeriod: { fiscalYear: { year } },
      },
    },
    select: {
      id: true,
      debitAmountLC: true,
      creditAmountLC: true,
      description: true,
      counterpartyCompanyId: true,
      account: { select: { code: true, name: true } },
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          entryDate: true,
          description: true,
          companyId: true,
        },
      },
    },
    orderBy: { journalEntry: { entryDate: "asc" } },
  });

  // 每行聚合为净额（借方正 / 贷方负）
  type ICItem = {
    lineId: string;
    journalEntryId: string;
    entryNumber: string;
    entryDate: Date;
    entryDescription: string;
    companyId: string;
    companyName: string;
    counterpartyCompanyId: string | null;
    accountCode: string;
    accountName: string;
    amount: number; // 正=借方净额，负=贷方净额
    lineDescription: string | null;
  };

  const items: ICItem[] = icLines.map((l) => {
    const debit  = parseFloat((l.debitAmountLC  ?? 0).toString());
    const credit = parseFloat((l.creditAmountLC ?? 0).toString());
    return {
      lineId:                l.id,
      journalEntryId:        l.journalEntry.id,
      entryNumber:           l.journalEntry.entryNumber,
      entryDate:             l.journalEntry.entryDate,
      entryDescription:      l.journalEntry.description ?? "",
      companyId:             l.journalEntry.companyId,
      companyName:           companyMap.get(l.journalEntry.companyId) ?? l.journalEntry.companyId,
      counterpartyCompanyId: l.counterpartyCompanyId,
      accountCode:           l.account.code,
      accountName:           l.account.name,
      amount:                debit - credit,
      lineDescription:       l.description ?? null,
    };
  });

  // 按公司对分组（key = sorted(companyA, companyB) 用 | 连接）
  type PairKey = string;
  type PairGroup = {
    companyA: string; nameA: string;
    companyB: string; nameB: string;
    itemsA: ICItem[];
    itemsB: ICItem[];
  };
  const pairs = new Map<PairKey, PairGroup>();

  for (const item of items) {
    const cpId = item.counterpartyCompanyId ?? "__unknown__";
    const ids = [item.companyId, cpId].sort();
    const key = ids.join("|");
    if (!pairs.has(key)) {
      pairs.set(key, {
        companyA: ids[0]!, nameA: companyMap.get(ids[0]!) ?? ids[0]!,
        companyB: ids[1]!, nameB: companyMap.get(ids[1]!) ?? ids[1]!,
        itemsA: [], itemsB: [],
      });
    }
    const g = pairs.get(key)!;
    if (item.companyId === ids[0]) g.itemsA.push(item);
    else g.itemsB.push(item);
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n));

  const totalIC = items.reduce((s, i) => s + Math.abs(i.amount), 0);

  // 可用年度
  const availableYears = await db.fiscalYear.findMany({
    where: { companyId: { in: companyIds } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* 面包屑 */}
      <div>
        <div className="flex items-center gap-2 mb-1 text-sm text-muted-foreground">
          <Link href="/consolidation" className="hover:text-foreground">合并报表</Link>
          <span>/</span>
          <Link href={`/consolidation/${groupId}`} className="hover:text-foreground">{group.name}</Link>
          <span>/</span>
          <span className="text-foreground">内部交易核对</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">内部交易核对</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          查看集团内标记为内部交易的凭证行，按公司对自动判断匹配状态
        </p>
      </div>

      {/* 年度选择 */}
      <form method="GET" className="flex items-end gap-3 bg-white border rounded-lg p-4 no-print">
        <div>
          <label className="block text-xs font-medium mb-1">年度</label>
          <select name="year" defaultValue={String(year)} className="rounded-md border px-3 py-1.5 text-sm">
            {availableYears.map((y) => (
              <option key={y.year} value={String(y.year)}>{y.year}年</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">
          查询
        </button>
      </form>

      {/* 汇总 */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">内部交易笔数</p>
          <p className="text-2xl font-bold mt-1">{items.length}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">内部交易金额合计</p>
          <p className="text-2xl font-bold mt-1">¥{fmt(totalIC)}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-muted-foreground">公司对数量</p>
          <p className="text-2xl font-bold mt-1">{pairs.size}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          {year}年暂无内部交易记录。
          <br />
          <span className="text-xs mt-1 block">
            在录入凭证时勾选「内部交易」复选框，即可在此处汇总查看。
          </span>
        </div>
      ) : (
        Array.from(pairs.entries()).map(([pairKey, g]) => {
          const totalA = g.itemsA.reduce((s, i) => s + i.amount, 0);
          const totalB = g.itemsB.reduce((s, i) => s + i.amount, 0);
          // 简单匹配：两侧合计绝对值之差 ≤ 1%
          const sumAbs = Math.abs(totalA) + Math.abs(totalB);
          const diff = Math.abs(Math.abs(totalA) - Math.abs(totalB));
          const matched = sumAbs === 0 || diff / sumAbs <= 0.01;

          return (
            <div key={pairKey} className="bg-white border rounded-lg overflow-hidden">
              {/* 公司对标题 */}
              <div className={`px-4 py-3 border-b flex items-center justify-between ${matched ? "bg-green-50" : "bg-amber-50"}`}>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold">{g.nameA}</span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="text-sm font-semibold">{g.nameB}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    差异：¥{fmt(Math.abs(totalA) - Math.abs(totalB))}
                  </span>
                  <span className={`text-xs font-medium rounded px-2 py-0.5 ${matched ? "bg-green-100 text-green-700 border border-green-300" : "bg-amber-100 text-amber-700 border border-amber-300"}`}>
                    {matched ? "✓ 已匹配" : "⚠ 待核对"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 divide-x">
                {/* 公司A */}
                <div>
                  <div className="px-4 py-2 bg-muted/20 border-b text-xs font-medium text-muted-foreground flex justify-between">
                    <span>{g.nameA}</span>
                    <span className="font-mono">{totalA >= 0 ? "+" : ""}¥{fmt(totalA)}</span>
                  </div>
                  {g.itemsA.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground">无记录</div>
                  ) : (
                    g.itemsA.map((item) => (
                      <div key={item.lineId} className="px-4 py-2 border-b last:border-0 hover:bg-muted/10">
                        <div className="flex justify-between items-start">
                          <div>
                            <Link href={`/journals/${item.journalEntryId}`} className="text-xs font-mono text-primary hover:underline">
                              {item.entryNumber}
                            </Link>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.entryDescription}</p>
                            <p className="text-xs text-muted-foreground">{item.accountCode} {item.accountName}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className={`text-xs font-mono font-medium ${item.amount >= 0 ? "text-blue-600" : "text-red-600"}`}>
                              {item.amount >= 0 ? "+" : ""}¥{fmt(item.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.entryDate.toISOString().slice(0, 10)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* 公司B */}
                <div>
                  <div className="px-4 py-2 bg-muted/20 border-b text-xs font-medium text-muted-foreground flex justify-between">
                    <span>{g.nameB}</span>
                    <span className="font-mono">{totalB >= 0 ? "+" : ""}¥{fmt(totalB)}</span>
                  </div>
                  {g.itemsB.length === 0 ? (
                    <div className="px-4 py-3 text-xs text-muted-foreground">无记录</div>
                  ) : (
                    g.itemsB.map((item) => (
                      <div key={item.lineId} className="px-4 py-2 border-b last:border-0 hover:bg-muted/10">
                        <div className="flex justify-between items-start">
                          <div>
                            <Link href={`/journals/${item.journalEntryId}`} className="text-xs font-mono text-primary hover:underline">
                              {item.entryNumber}
                            </Link>
                            <p className="text-xs text-muted-foreground mt-0.5">{item.entryDescription}</p>
                            <p className="text-xs text-muted-foreground">{item.accountCode} {item.accountName}</p>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className={`text-xs font-mono font-medium ${item.amount >= 0 ? "text-blue-600" : "text-red-600"}`}>
                              {item.amount >= 0 ? "+" : ""}¥{fmt(item.amount)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {item.entryDate.toISOString().slice(0, 10)}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
