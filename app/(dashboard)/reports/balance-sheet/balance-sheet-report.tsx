"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/utils";

type Period = {
  id: string;
  name: string;
  year: number;
  status: string;
};

type AccountBalance = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  normalBalance: string;
  reportCategory: string | null;
  balance: number;
};

interface BalanceSheetReportProps {
  periods: Period[];
  selectedPeriodId: string;
  selectedPeriodName: string;
  accountBalances: AccountBalance[];
  priorYearBalances?: AccountBalance[];
  priorYearName?: string;
  companyName: string;
}

// 报表分类显示名
const categoryLabel: Record<string, string> = {
  CURRENT_ASSET:         "流动资产",
  NON_CURRENT_ASSET:     "非流动资产",
  CURRENT_LIABILITY:     "流动负债",
  NON_CURRENT_LIABILITY: "非流动负债",
  EQUITY_ITEM:           "所有者权益",
};

const ASSET_CATEGORIES       = ["CURRENT_ASSET", "NON_CURRENT_ASSET"] as const;
const LIABILITY_EQUITY_CATS  = ["CURRENT_LIABILITY", "NON_CURRENT_LIABILITY", "EQUITY_ITEM"] as const;
type Category = typeof ASSET_CATEGORIES[number] | typeof LIABILITY_EQUITY_CATS[number];

export function BalanceSheetReport({
  periods,
  selectedPeriodId,
  selectedPeriodName,
  accountBalances,
  priorYearBalances = [],
  priorYearName = "",
  companyName,
}: BalanceSheetReportProps) {
  const router = useRouter();

  const hasPrior = priorYearBalances.length > 0 && !!priorYearName;

  // ── 当期：净利润推算 ─────────────────────────────────────────────
  const totalRevenue  = accountBalances.filter((a) => a.accountType === "REVENUE").reduce((s, a) => s + a.balance, 0);
  const totalExpense  = accountBalances.filter((a) => a.accountType === "EXPENSE").reduce((s, a) => s + a.balance, 0);
  const currentProfit = totalRevenue - totalExpense;

  // ── 上年：净利润推算 ──────────────────────────────────────────────
  const priorRevenue  = priorYearBalances.filter((a) => a.accountType === "REVENUE").reduce((s, a) => s + a.balance, 0);
  const priorExpense  = priorYearBalances.filter((a) => a.accountType === "EXPENSE").reduce((s, a) => s + a.balance, 0);
  const priorProfit   = priorRevenue - priorExpense;

  // ── 按 reportCategory 分组（当期） ───────────────────────────────
  const bsAccounts = accountBalances.filter(
    (a) => ["ASSET", "LIABILITY", "EQUITY"].includes(a.accountType) && a.balance !== 0
  );
  const grouped = new Map<string, AccountBalance[]>();
  const uncategorized: AccountBalance[] = [];
  for (const acc of bsAccounts) {
    if (acc.reportCategory && [...ASSET_CATEGORIES, ...LIABILITY_EQUITY_CATS].includes(acc.reportCategory as Category)) {
      if (!grouped.has(acc.reportCategory)) grouped.set(acc.reportCategory, []);
      grouped.get(acc.reportCategory)!.push(acc);
    } else {
      uncategorized.push(acc);
    }
  }

  // ── 上年 Map（按 accountCode 快速查找） ──────────────────────────
  const priorMap = new Map<string, number>();
  for (const a of priorYearBalances) priorMap.set(a.accountCode, a.balance);

  // ── 当期小计 ─────────────────────────────────────────────────────
  const subtotal = (cat: string) => (grouped.get(cat) ?? []).reduce((s, a) => s + a.balance, 0);
  const priorSubtotal = (cat: string) => {
    const codes = (grouped.get(cat) ?? []).map((a) => a.accountCode);
    // For prior year subtotal: sum all prior year BS accounts in this category
    return priorYearBalances
      .filter((a) => a.reportCategory === cat && ["ASSET", "LIABILITY", "EQUITY"].includes(a.accountType))
      .reduce((s, a) => s + a.balance, 0);
  };

  const totalCurrentAsset    = subtotal("CURRENT_ASSET");
  const totalNonCurrentAsset = subtotal("NON_CURRENT_ASSET");
  const totalAssets          = totalCurrentAsset + totalNonCurrentAsset;

  const totalCurrentLiab     = subtotal("CURRENT_LIABILITY");
  const totalNonCurrentLiab  = subtotal("NON_CURRENT_LIABILITY");
  const totalLiabilities     = totalCurrentLiab + totalNonCurrentLiab;
  const totalEquityBooked    = subtotal("EQUITY_ITEM");
  const totalEquity          = totalEquityBooked + currentProfit;
  const totalLiabEquity      = totalLiabilities + totalEquity;

  const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

  // ── 上年小计 ──────────────────────────────────────────────────────
  const priorCurrentAsset    = priorSubtotal("CURRENT_ASSET");
  const priorNonCurrentAsset = priorSubtotal("NON_CURRENT_ASSET");
  const priorTotalAssets     = priorCurrentAsset + priorNonCurrentAsset;
  const priorCurrentLiab     = priorSubtotal("CURRENT_LIABILITY");
  const priorNonCurrentLiab  = priorSubtotal("NON_CURRENT_LIABILITY");
  const priorTotalLiab       = priorCurrentLiab + priorNonCurrentLiab;
  const priorEquityBooked    = priorSubtotal("EQUITY_ITEM");
  const priorTotalEquity     = priorEquityBooked + priorProfit;
  const priorTotalLiabEquity = priorTotalLiab + priorTotalEquity;

  // ── 渲染帮助函数 ──────────────────────────────────────────────────
  const Amt = ({
    value,
    prior,
    className = "",
  }: {
    value: number;
    prior?: number;
    className?: string;
  }) => (
    <>
      <span className={`font-mono tabular-nums w-28 text-right shrink-0 ${value < 0 ? "text-red-500" : "text-gray-900"} ${className}`}>
        {formatAmount(value)}
      </span>
      {hasPrior && (
        <span className="font-mono tabular-nums w-28 text-right shrink-0 text-muted-foreground">
          {prior != null ? formatAmount(prior) : "—"}
        </span>
      )}
    </>
  );

  const renderSection = (cat: string, priorCat?: string) => {
    const accounts = grouped.get(cat) ?? [];
    if (accounts.length === 0 && subtotal(cat) === 0) return null;
    return (
      <div key={cat} className="mb-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">
          {categoryLabel[cat] ?? cat}
        </div>
        {accounts.map((acc) => (
          <div key={acc.accountId} className="flex items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm">
            <span className="flex-1 text-gray-700 min-w-0 truncate">
              <span className="font-mono text-xs text-gray-400 mr-2">{acc.accountCode}</span>
              {acc.accountName}
            </span>
            <Amt value={acc.balance} prior={priorMap.get(acc.accountCode)} />
          </div>
        ))}
      </div>
    );
  };

  const renderSubtotalRow = (label: string, current: number, prior?: number) => (
    <div className="flex items-center py-1 px-2 border-t border-gray-200 text-sm font-medium">
      <span className="flex-1">{label}</span>
      <Amt value={current} prior={prior} />
    </div>
  );

  const renderTotalRow = (label: string, current: number, prior?: number, highlight = false) => (
    <div
      className={`flex items-center py-1.5 px-2 border-t-2 border-gray-400 text-sm font-semibold ${
        highlight ? "bg-blue-50" : ""
      }`}
    >
      <span className="flex-1">{label}</span>
      <Amt value={current} prior={prior} />
    </div>
  );

  const renderUncategorized = (type: "ASSET" | "LIABILITY" | "EQUITY", label: string) => {
    const items = uncategorized.filter((a) => a.accountType === type);
    if (items.length === 0) return null;
    return (
      <div className="mb-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">{label}</div>
        {items.map((acc) => (
          <div key={acc.accountId} className="flex items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm">
            <span className="flex-1 text-gray-700 min-w-0 truncate">
              <span className="font-mono text-xs text-gray-400 mr-2">{acc.accountCode}</span>
              {acc.accountName}
            </span>
            <Amt value={acc.balance} prior={priorMap.get(acc.accountCode)} />
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* 期间选择 + 平衡验证 */}
      <Card className="no-print">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium">选择期间：</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedPeriodId}
              onChange={(e) =>
                router.push(`/reports/balance-sheet?periodId=${e.target.value}`)
              }
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.status === "OPEN" ? "开放" : "已关闭"}）
                </option>
              ))}
            </select>
            {bsAccounts.length > 0 && (
              <Badge variant={isBalanced ? "success" : "destructive"}>
                {isBalanced ? "✓ 资产 = 负债 + 权益" : "✗ 报表不平衡，请检查数据"}
              </Badge>
            )}
            <button
              onClick={() => window.print()}
              className="ml-auto text-sm px-3 py-1.5 rounded-md border border-input bg-background hover:bg-accent transition-colors"
            >
              🖨 打印 / 导出 PDF
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 报表主体 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-center">
            {companyName} 资产负债表
          </CardTitle>
          <p className="text-xs text-center text-muted-foreground">
            报告期末：{selectedPeriodName}
          </p>
          <p className="text-xs text-center text-muted-foreground">单位：元</p>
        </CardHeader>
        <CardContent className="p-4">
          {bsAccounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {selectedPeriodId ? "该期间暂无已过账凭证" : "请选择会计期间"}
            </div>
          ) : (
            <>
              {/* 列头 */}
              {hasPrior && (
                <div className="flex text-xs text-muted-foreground font-medium mb-1">
                  <div className="grid grid-cols-2 gap-6 w-full">
                    {/* 左：资产 */}
                    <div className="flex">
                      <span className="flex-1" />
                      <span className="w-28 text-right">期末余额</span>
                      <span className="w-28 text-right">{priorYearName}</span>
                    </div>
                    {/* 右：负债权益 */}
                    <div className="flex">
                      <span className="flex-1" />
                      <span className="w-28 text-right">期末余额</span>
                      <span className="w-28 text-right">{priorYearName}</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-6">
                {/* ── 左栏：资产 ─────────────────────────────────── */}
                <div className="border rounded-lg p-3">
                  <div className="text-sm font-bold text-center border-b pb-2 mb-3">资产</div>
                  {renderSection("CURRENT_ASSET")}
                  {renderSubtotalRow("流动资产合计", totalCurrentAsset, hasPrior ? priorCurrentAsset : undefined)}
                  <div className="mb-3" />
                  {renderSection("NON_CURRENT_ASSET")}
                  {renderSubtotalRow("非流动资产合计", totalNonCurrentAsset, hasPrior ? priorNonCurrentAsset : undefined)}
                  {renderUncategorized("ASSET", "其他资产")}
                  {renderTotalRow("资产总计", totalAssets, hasPrior ? priorTotalAssets : undefined, true)}
                </div>

                {/* ── 右栏：负债 + 所有者权益 ────────────────────── */}
                <div className="border rounded-lg p-3">
                  <div className="text-sm font-bold text-center border-b pb-2 mb-3">
                    负债及所有者权益
                  </div>
                  <div className="mb-1 px-2 text-xs font-bold text-gray-600">负债</div>
                  {renderSection("CURRENT_LIABILITY")}
                  {renderSubtotalRow("流动负债合计", totalCurrentLiab, hasPrior ? priorCurrentLiab : undefined)}
                  <div className="mb-3" />
                  {renderSection("NON_CURRENT_LIABILITY")}
                  {renderSubtotalRow("非流动负债合计", totalNonCurrentLiab, hasPrior ? priorNonCurrentLiab : undefined)}
                  {renderUncategorized("LIABILITY", "其他负债")}
                  {renderSubtotalRow("负债合计", totalLiabilities, hasPrior ? priorTotalLiab : undefined)}

                  <div className="my-3 border-t border-dashed" />
                  <div className="mb-1 px-2 text-xs font-bold text-gray-600">所有者权益</div>
                  {renderSection("EQUITY_ITEM")}
                  {renderUncategorized("EQUITY", "其他权益")}
                  {/* 净利润推算行（当期） */}
                  {currentProfit !== 0 && (
                    <div className="flex items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm">
                      <span className="flex-1 text-gray-500 italic">本期净利润（推算）</span>
                      <Amt
                        value={currentProfit}
                        prior={hasPrior && priorProfit !== 0 ? priorProfit : undefined}
                        className={currentProfit < 0 ? "text-red-500" : "text-green-600"}
                      />
                    </div>
                  )}
                  {renderSubtotalRow("所有者权益合计", totalEquity, hasPrior ? priorTotalEquity : undefined)}
                  {renderTotalRow(
                    "负债和所有者权益总计",
                    totalLiabEquity,
                    hasPrior ? priorTotalLiabEquity : undefined,
                    true
                  )}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 不平衡警告 */}
      {bsAccounts.length > 0 && !isBalanced && (
        <Card className="border-destructive">
          <CardContent className="pt-4">
            <p className="text-sm text-destructive">
              ⚠️ 报表不平衡：资产总计（{formatAmount(totalAssets)}）≠ 负债和所有者权益总计（
              {formatAmount(totalLiabEquity)}），差额 {formatAmount(Math.abs(totalAssets - totalLiabEquity))}。
              请检查是否存在未分类的收入/费用科目余额，或核实各科目 reportCategory 设置是否正确。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
