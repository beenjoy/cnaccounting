import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";

const CATEGORY_LABELS: Record<string, string> = {
  BUILDINGS: "房屋建筑物",
  MACHINERY: "机器设备",
  VEHICLES: "运输设备",
  ELECTRONICS: "电子设备",
  OFFICE_FURNITURE: "办公设备",
  OTHER: "其他",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE:            { label: "在用", cls: "bg-green-100 text-green-700" },
  IDLE:              { label: "停用", cls: "bg-gray-100 text-gray-600" },
  DISPOSED:          { label: "已处置", cls: "bg-red-100 text-red-600" },
  FULLY_DEPRECIATED: { label: "已提足", cls: "bg-amber-100 text-amber-700" },
};

const DEP_METHOD_LABELS: Record<string, string> = {
  STRAIGHT_LINE:     "直线法",
  DECLINING_BALANCE: "双倍余额",
  SUM_OF_YEARS:      "年数总和",
  USAGE_BASED:       "工作量法",
};

interface SearchParams { companyId?: string; category?: string; }

export default async function AssetSchedulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sp = await searchParams;

  const member = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: { companies: { where: { isActive: true }, orderBy: { name: "asc" } } },
      },
    },
  });
  if (!member) redirect("/onboarding");

  const companies = member.organization.companies;
  if (companies.length === 0) redirect("/onboarding");

  const selectedCompanyId = sp.companyId ?? companies[0]!.id;
  const company = companies.find((c) => c.id === selectedCompanyId) ?? companies[0]!;

  const assets = await db.fixedAsset.findMany({
    where: {
      companyId: company.id,
      ...(sp.category ? { category: sp.category as never } : {}),
    },
    orderBy: [{ category: "asc" }, { assetNumber: "asc" }],
    select: {
      id: true,
      assetNumber: true,
      name: true,
      category: true,
      department: true,
      acquisitionDate: true,
      acquisitionCost: true,
      residualRate: true,
      usefulLifeMonths: true,
      depreciationMethod: true,
      accumulatedDepreciation: true,
      impairmentReserve: true,
      status: true,
      _count: { select: { depreciationRecords: true } },
    },
  });

  // Group by category
  type AssetRow = typeof assets[0] & {
    bookValue: number;
    residualValue: number;
    depreciatedPercent: number;
    remainingMonths: number;
  };

  const enriched: AssetRow[] = assets.map((a) => {
    const cost = Number(a.acquisitionCost);
    const accDep = Number(a.accumulatedDepreciation);
    const impairment = Number(a.impairmentReserve);
    const residualValue = cost * Number(a.residualRate);
    const depreciableAmount = cost - residualValue;
    const bookValue = cost - accDep - impairment;
    const depreciatedPercent = depreciableAmount > 0 ? (accDep / depreciableAmount) * 100 : 100;
    const monthsUsed = depreciableAmount > 0
      ? Math.round((accDep / depreciableAmount) * a.usefulLifeMonths)
      : a.usefulLifeMonths;
    const remainingMonths = Math.max(a.usefulLifeMonths - monthsUsed, 0);
    return { ...a, bookValue, residualValue, depreciatedPercent, remainingMonths };
  });

  // Category subtotals
  const categories = [...new Set(enriched.map((a) => a.category))];
  const subtotals = categories.map((cat) => {
    const group = enriched.filter((a) => a.category === cat);
    return {
      category: cat,
      count: group.length,
      totalCost: group.reduce((s, a) => s + Number(a.acquisitionCost), 0),
      totalAccDep: group.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0),
      totalBookValue: group.reduce((s, a) => s + a.bookValue, 0),
    };
  });

  const totalCost = enriched.reduce((s, a) => s + Number(a.acquisitionCost), 0);
  const totalAccDep = enriched.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0);
  const totalBookValue = enriched.reduce((s, a) => s + a.bookValue, 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">固定资产折旧明细表</h1>
          <p className="text-sm text-muted-foreground mt-1">{company.name}</p>
        </div>
        <button onClick={() => typeof window !== "undefined" && window.print()}
          className="no-print rounded-md border px-4 py-2 text-sm hover:bg-muted">打印</button>
      </div>

      {/* Filters */}
      <form method="GET" className="no-print flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
        {companies.length > 1 && (
          <div>
            <label className="block text-xs font-medium mb-1">公司</label>
            <select name="companyId" defaultValue={company.id} className="rounded-md border px-3 py-1.5 text-sm">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1">资产分类</label>
          <select name="category" defaultValue={sp.category ?? ""} className="rounded-md border px-3 py-1.5 text-sm">
            <option value="">全部分类</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">筛选</button>
      </form>

      {/* Category summary */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <h2 className="text-sm font-semibold">按分类汇总</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-muted/20 border-b">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-muted-foreground">资产分类</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">数量</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">原值合计</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">累计折旧</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">账面净值</th>
              <th className="px-4 py-2 text-right font-medium text-muted-foreground">净值率</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {subtotals.map((s) => (
              <tr key={s.category} className="hover:bg-muted/20">
                <td className="px-4 py-2 font-medium">{CATEGORY_LABELS[s.category] ?? s.category}</td>
                <td className="px-4 py-2 text-right">{s.count}</td>
                <td className="px-4 py-2 text-right font-mono">{fmt(s.totalCost)}</td>
                <td className="px-4 py-2 text-right font-mono text-muted-foreground">{fmt(s.totalAccDep)}</td>
                <td className="px-4 py-2 text-right font-mono font-medium">{fmt(s.totalBookValue)}</td>
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {s.totalCost > 0 ? ((s.totalBookValue / s.totalCost) * 100).toFixed(1) : "0.0"}%
                </td>
              </tr>
            ))}
            <tr className="border-t-2 bg-muted/30 font-semibold">
              <td className="px-4 py-2">合计</td>
              <td className="px-4 py-2 text-right">{enriched.length}</td>
              <td className="px-4 py-2 text-right font-mono">{fmt(totalCost)}</td>
              <td className="px-4 py-2 text-right font-mono">{fmt(totalAccDep)}</td>
              <td className="px-4 py-2 text-right font-mono">{fmt(totalBookValue)}</td>
              <td className="px-4 py-2 text-right">{totalCost > 0 ? ((totalBookValue / totalCost) * 100).toFixed(1) : "0.0"}%</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Detailed table */}
      {enriched.length > 0 && (
        <div className="bg-white border rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h2 className="text-sm font-semibold">固定资产折旧明细</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/20 border-b">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">资产编号</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">名称</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">分类</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">状态</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">原值</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">净残值</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">累计折旧</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">账面净值</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">折旧法</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">使用月</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">剩余月</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">已折旧%</th>
                  <th className="px-3 py-2 text-left font-medium text-muted-foreground">入账日期</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {enriched.map((a) => {
                  const statusInfo = STATUS_LABELS[a.status] ?? { label: a.status, cls: "bg-gray-100 text-gray-600" };
                  return (
                    <tr key={a.id} className="hover:bg-muted/20">
                      <td className="px-3 py-2 font-mono">{a.assetNumber}</td>
                      <td className="px-3 py-2">
                        <div>{a.name}</div>
                        {a.department && <div className="text-muted-foreground">{a.department}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{CATEGORY_LABELS[a.category] ?? a.category}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${statusInfo.cls}`}>
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{fmt(Number(a.acquisitionCost))}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(a.residualValue)}</td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(Number(a.accumulatedDepreciation))}</td>
                      <td className="px-3 py-2 text-right font-mono font-medium">{fmt(a.bookValue)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{DEP_METHOD_LABELS[a.depreciationMethod] ?? a.depreciationMethod}</td>
                      <td className="px-3 py-2 text-right">{a._count.depreciationRecords}</td>
                      <td className="px-3 py-2 text-right">{a.remainingMonths}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex items-center gap-1 justify-end">
                          <div className="w-12 bg-gray-200 rounded-full h-1.5">
                            <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${Math.min(a.depreciatedPercent, 100)}%` }} />
                          </div>
                          <span>{a.depreciatedPercent.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.acquisitionDate.toISOString().slice(0, 10)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {enriched.length === 0 && (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">暂无固定资产数据</div>
      )}
    </div>
  );
}
