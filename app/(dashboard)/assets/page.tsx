import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AssetActions } from "./asset-actions";

const CATEGORY_LABELS: Record<string, string> = {
  BUILDINGS: "房屋建筑物",
  MACHINERY: "机器设备",
  VEHICLES: "运输设备",
  ELECTRONICS: "电子设备",
  OFFICE_FURNITURE: "办公设备",
  OTHER: "其他",
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  ACTIVE:             { label: "在用", cls: "bg-green-100 text-green-700" },
  IDLE:               { label: "停用", cls: "bg-gray-100 text-gray-600" },
  DISPOSED:           { label: "已处置", cls: "bg-red-100 text-red-600" },
  FULLY_DEPRECIATED:  { label: "已提足", cls: "bg-amber-100 text-amber-700" },
};

interface SearchParams { companyId?: string; status?: string; category?: string; }

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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
  const canEdit = ["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role);

  // Load leaf accounts for account selector
  const leafAccounts = canEdit ? await db.chartOfAccount.findMany({
    where: { companyId: company.id, isLeaf: true, isActive: true },
    select: { id: true, code: true, name: true },
    orderBy: { code: "asc" },
  }) : [];

  // Load open fiscal periods (for impairment journal entry generation)
  const openPeriods = canEdit ? await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id }, status: "OPEN" },
    select: { id: true, name: true },
    orderBy: [{ fiscalYear: { year: "desc" } }, { periodNumber: "desc" }],
  }) : [];

  const assets = await db.fixedAsset.findMany({
    where: {
      companyId: company.id,
      ...(sp.status ? { status: sp.status as never } : {}),
      ...(sp.category ? { category: sp.category as never } : {}),
    },
    include: {
      costAccount: { select: { code: true, name: true } },
      accDepAccount: { select: { code: true, name: true } },
    },
    orderBy: { assetNumber: "asc" },
  });

  const totalCost       = assets.reduce((s, a) => s + Number(a.acquisitionCost), 0);
  const totalAccDep     = assets.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0);
  const totalImpair     = assets.reduce((s, a) => s + Number(a.impairmentReserve), 0);
  const totalBookValue  = totalCost - totalAccDep - totalImpair;

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">固定资产台账</h1>
          <p className="text-sm text-muted-foreground mt-1">管理企业固定资产卡片与折旧信息</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/assets/depreciation?companyId=${company.id}`}
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted">
            月度折旧
          </Link>
          {canEdit && (
            <AssetActions companyId={company.id} leafAccounts={leafAccounts} />
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "资产原值合计", value: fmt(totalCost), sub: `${assets.length} 项资产` },
          { label: "累计折旧合计", value: fmt(totalAccDep), sub: `折旧率 ${totalCost > 0 ? ((totalAccDep / totalCost) * 100).toFixed(1) : "0.0"}%` },
          { label: "账面净值合计", value: fmt(totalBookValue), sub: totalImpair > 0 ? `含减值准备 ¥${fmt(totalImpair)}` : `净值率 ${totalCost > 0 ? ((totalBookValue / totalCost) * 100).toFixed(1) : "0.0"}%` },
        ].map((card) => (
          <div key={card.label} className="rounded-lg border bg-white p-4">
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className="text-2xl font-bold mt-1">¥{card.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <form method="GET" className="flex flex-wrap items-end gap-3 bg-white border rounded-lg p-4">
        {companies.length > 1 && (
          <div>
            <label className="block text-xs font-medium mb-1">公司</label>
            <select name="companyId" defaultValue={company.id} className="rounded-md border px-3 py-1.5 text-sm">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs font-medium mb-1">状态</label>
          <select name="status" defaultValue={sp.status ?? ""} className="rounded-md border px-3 py-1.5 text-sm">
            <option value="">全部状态</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">分类</label>
          <select name="category" defaultValue={sp.category ?? ""} className="rounded-md border px-3 py-1.5 text-sm">
            <option value="">全部分类</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">
          筛选
        </button>
      </form>

      {/* Table */}
      {assets.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border">
          <p className="text-lg font-medium text-muted-foreground">暂无固定资产</p>
          {canEdit && <p className="text-sm text-muted-foreground mt-1">点击右上角「新增资产」录入第一项资产</p>}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 border-b">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">资产编号</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">名称</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">分类</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">状态</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">原值</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">累计折旧</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">账面净值</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">折旧法</th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">入账日期</th>
                {canEdit && <th className="px-4 py-3 text-center font-medium text-muted-foreground">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {assets.map((asset) => {
                const cost      = Number(asset.acquisitionCost);
                const accDep    = Number(asset.accumulatedDepreciation);
                const impair    = Number(asset.impairmentReserve);
                const bookValue = cost - accDep - impair;
                const statusInfo = STATUS_LABELS[asset.status] ?? { label: asset.status, cls: "bg-gray-100 text-gray-600" };

                // Serialize Decimal fields to plain numbers for Client Component
                const assetForClient = {
                  ...asset,
                  acquisitionCost: cost,
                  residualRate: Number(asset.residualRate),
                  totalWorkload: asset.totalWorkload != null ? Number(asset.totalWorkload) : null,
                  accumulatedDepreciation: accDep,
                  impairmentReserve: impair,
                };

                return (
                  <tr key={asset.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3 font-mono text-xs">{asset.assetNumber}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{asset.name}</div>
                      {asset.department && <div className="text-xs text-muted-foreground">{asset.department}</div>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{CATEGORY_LABELS[asset.category] ?? asset.category}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusInfo.cls}`}>
                        {statusInfo.label}
                      </span>
                      {impair > 0 && (
                        <div className="text-xs text-red-600 mt-0.5">减值准备：¥{fmt(impair)}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{fmt(cost)}</td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground">{fmt(accDep)}</td>
                    <td className="px-4 py-3 text-right font-mono font-medium">{fmt(bookValue)}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {asset.depreciationMethod === "STRAIGHT_LINE" ? "直线法" :
                       asset.depreciationMethod === "DECLINING_BALANCE" ? "双倍余额" :
                       asset.depreciationMethod === "SUM_OF_YEARS" ? "年数总和" : "工作量法"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {asset.acquisitionDate.toISOString().slice(0, 10)}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex justify-center gap-2">
                          <AssetActions companyId={company.id} leafAccounts={leafAccounts} mode="edit" asset={assetForClient} />
                          {asset.status !== "DISPOSED" && (
                            <>
                              <AssetActions companyId={company.id} leafAccounts={leafAccounts} mode="impair" asset={assetForClient} periods={openPeriods} />
                              <AssetActions companyId={company.id} leafAccounts={leafAccounts} mode="dispose" asset={assetForClient} />
                            </>
                          )}
                          <AssetActions companyId={company.id} leafAccounts={leafAccounts} mode="delete" asset={assetForClient} />
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
