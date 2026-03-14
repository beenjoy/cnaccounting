import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { DepreciationActions } from "./depreciation-actions";

interface SearchParams { companyId?: string; periodId?: string; }

function calcMonthlyDep(
  acquisitionCost: number, residualRate: number, usefulLifeMonths: number,
  method: string, accumulatedDepreciation: number,
): number {
  const residualValue = acquisitionCost * residualRate;
  const depreciableAmount = acquisitionCost - residualValue;
  const bookValue = acquisitionCost - accumulatedDepreciation;
  if (bookValue <= residualValue + 0.005) return 0;

  const monthsUsed = Math.round((accumulatedDepreciation / (depreciableAmount || 1)) * usefulLifeMonths);
  const remainingMonths = Math.max(usefulLifeMonths - monthsUsed, 0);

  switch (method) {
    case "STRAIGHT_LINE":
      return +(depreciableAmount / usefulLifeMonths).toFixed(2);
    case "DECLINING_BALANCE": {
      const annualRate = 2 / (usefulLifeMonths / 12);
      if (remainingMonths <= 24) return +((bookValue - residualValue) / Math.max(remainingMonths, 1)).toFixed(2);
      return +(bookValue * (annualRate / 12)).toFixed(2);
    }
    case "SUM_OF_YEARS": {
      const years = usefulLifeMonths / 12;
      const sumOfYears = (years * (years + 1)) / 2;
      const yearUsed = Math.floor(monthsUsed / 12);
      const remainingYears = years - yearUsed;
      return +(depreciableAmount * (remainingYears / sumOfYears) / 12).toFixed(2);
    }
    default:
      return +(depreciableAmount / usefulLifeMonths).toFixed(2);
  }
}

export default async function DepreciationPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
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

  const periods = await db.fiscalPeriod.findMany({
    where: { fiscalYear: { companyId: company.id } },
    orderBy: { startDate: "desc" },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });

  const today = new Date();
  const currentPeriod = periods.find((p) => p.startDate <= today && p.endDate >= today) ?? periods[0];
  const selectedPeriodId = sp.periodId ?? currentPeriod?.id ?? "";
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId) ?? periods[0];

  // Check if depreciation already run for this period
  const existingDepCount = selectedPeriodId ? await db.depreciationRecord.count({
    where: { fiscalPeriod: { id: selectedPeriodId }, asset: { companyId: company.id } },
  }) : 0;

  // Load active assets
  const assets = await db.fixedAsset.findMany({
    where: { companyId: company.id, status: { in: ["ACTIVE", "IDLE"] } },
    select: {
      id: true, assetNumber: true, name: true, acquisitionDate: true,
      acquisitionCost: true, residualRate: true, usefulLifeMonths: true,
      depreciationMethod: true, accumulatedDepreciation: true, department: true,
    },
    orderBy: { assetNumber: "asc" },
  });

  // For each asset, compute this period's depreciation preview
  const periodYear = selectedPeriod ? selectedPeriod.startDate.getFullYear() : today.getFullYear();
  const periodMonth = selectedPeriod ? selectedPeriod.startDate.getMonth() : today.getMonth();

  type Preview = {
    id: string; assetNumber: string; name: string; department: string | null;
    bookValue: number; monthlyDep: number; skip: boolean; skipReason?: string;
  };

  const previews: Preview[] = assets.map((asset) => {
    const acqYear = asset.acquisitionDate.getFullYear();
    const acqMonth = asset.acquisitionDate.getMonth();
    if (acqYear === periodYear && acqMonth === periodMonth) {
      return { id: asset.id, assetNumber: asset.assetNumber, name: asset.name, department: asset.department,
        bookValue: Number(asset.acquisitionCost), monthlyDep: 0, skip: true, skipReason: "本期新增，次月起折旧" };
    }
    const cost = Number(asset.acquisitionCost);
    const accDep = Number(asset.accumulatedDepreciation);
    const dep = calcMonthlyDep(cost, Number(asset.residualRate), asset.usefulLifeMonths, asset.depreciationMethod, accDep);
    return {
      id: asset.id, assetNumber: asset.assetNumber, name: asset.name, department: asset.department,
      bookValue: cost - accDep, monthlyDep: dep,
      skip: dep <= 0, skipReason: dep <= 0 ? "已提足折旧" : undefined,
    };
  });

  const eligiblePreviews = previews.filter((p) => !p.skip);
  const totalDep = eligiblePreviews.reduce((s, p) => s + p.monthlyDep, 0);

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">月度折旧计提</h1>
          <p className="text-sm text-muted-foreground mt-1">按期间批量计提固定资产折旧并生成凭证</p>
        </div>
        <Link href={`/assets?companyId=${company.id}`} className="text-sm text-primary hover:underline">← 资产台账</Link>
      </div>

      {/* Period selector */}
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
          <label className="block text-xs font-medium mb-1">会计期间</label>
          <select name="periodId" defaultValue={selectedPeriodId} className="rounded-md border px-3 py-1.5 text-sm min-w-40">
            {periods.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-md bg-secondary px-4 py-1.5 text-sm font-medium hover:bg-secondary/80">
          查询
        </button>
      </form>

      {assets.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg border text-muted-foreground">
          暂无在用固定资产，<Link href={`/assets?companyId=${company.id}`} className="text-primary hover:underline">请先录入资产</Link>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">本期计提资产数</p>
              <p className="text-2xl font-bold mt-1">{eligiblePreviews.length}</p>
              <p className="text-xs text-muted-foreground mt-1">共 {assets.length} 项在用资产</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">本期折旧合计</p>
              <p className="text-2xl font-bold mt-1">¥{fmt(totalDep)}</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedPeriod?.name}</p>
            </div>
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">执行状态</p>
              <p className={`text-2xl font-bold mt-1 ${existingDepCount > 0 ? "text-green-600" : "text-amber-600"}`}>
                {existingDepCount > 0 ? "已执行" : "待执行"}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {existingDepCount > 0 ? `已有 ${existingDepCount} 条折旧记录` : "本期尚未计提"}
              </p>
            </div>
          </div>

          {/* Preview table */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b bg-muted/30 flex justify-between items-center">
              <h2 className="text-sm font-semibold">折旧明细预览 — {selectedPeriod?.name}</h2>
              {existingDepCount > 0 && (
                <span className="text-xs text-green-600 bg-green-50 border border-green-200 rounded px-2 py-0.5">本期已计提</span>
              )}
            </div>
            <table className="w-full text-sm">
              <thead className="bg-muted/20 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">资产编号</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">名称</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">部门</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">账面净值</th>
                  <th className="px-4 py-2 text-right font-medium text-muted-foreground">本期折旧</th>
                  <th className="px-4 py-2 text-left font-medium text-muted-foreground">备注</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {previews.map((p) => (
                  <tr key={p.id} className={p.skip ? "opacity-50" : "hover:bg-muted/20"}>
                    <td className="px-4 py-2 font-mono text-xs">{p.assetNumber}</td>
                    <td className="px-4 py-2">{p.name}</td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">{p.department ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono">{fmt(p.bookValue)}</td>
                    <td className={`px-4 py-2 text-right font-mono font-medium ${p.skip ? "text-muted-foreground" : "text-blue-600"}`}>
                      {p.skip ? "—" : fmt(p.monthlyDep)}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{p.skipReason ?? ""}</td>
                  </tr>
                ))}
                <tr className="border-t-2 bg-muted/30 font-semibold">
                  <td colSpan={4} className="px-4 py-2 text-right">合计</td>
                  <td className="px-4 py-2 text-right font-mono text-blue-600">¥{fmt(totalDep)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Action */}
          {canEdit && selectedPeriod && (
            <div className="bg-white border rounded-lg p-6">
              <h3 className="text-base font-semibold mb-2">执行折旧计提</h3>
              {existingDepCount > 0 ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-4 py-2">
                  ✓ 本期已完成折旧计提（{existingDepCount} 条），已生成折旧凭证。如需重新计提请先联系管理员删除折旧记录。
                </p>
              ) : selectedPeriod.status === "CLOSED" ? (
                <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-4 py-2">
                  ⚠ 该期间已关闭，无法执行折旧计提
                </p>
              ) : eligiblePreviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">本期无需计提折旧（所有资产均为新增或已提足）</p>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground mb-4">
                    点击下方按钮将为 <strong>{eligiblePreviews.length}</strong> 项资产计提折旧合计
                    <strong> ¥{fmt(totalDep)}</strong>，并生成草稿状态凭证。
                  </p>
                  <DepreciationActions
                    companyId={company.id}
                    fiscalPeriodId={selectedPeriodId}
                    periodName={selectedPeriod.name}
                    assetCount={eligiblePreviews.length}
                    totalAmount={totalDep}
                  />
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
