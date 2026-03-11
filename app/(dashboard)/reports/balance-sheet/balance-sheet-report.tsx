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
  companyName: string;
}

// 报表分类显示名
const categoryLabel: Record<string, string> = {
  CURRENT_ASSET:          "流动资产",
  NON_CURRENT_ASSET:      "非流动资产",
  CURRENT_LIABILITY:      "流动负债",
  NON_CURRENT_LIABILITY:  "非流动负债",
  EQUITY_ITEM:            "所有者权益",
};

// 左侧（资产）分类顺序
const ASSET_CATEGORIES = ["CURRENT_ASSET", "NON_CURRENT_ASSET"] as const;
// 右侧（负债+权益）分类顺序
const LIABILITY_EQUITY_CATEGORIES = [
  "CURRENT_LIABILITY",
  "NON_CURRENT_LIABILITY",
  "EQUITY_ITEM",
] as const;

type Category = typeof ASSET_CATEGORIES[number] | typeof LIABILITY_EQUITY_CATEGORIES[number];

export function BalanceSheetReport({
  periods,
  selectedPeriodId,
  selectedPeriodName,
  accountBalances,
  companyName,
}: BalanceSheetReportProps) {
  const router = useRouter();

  // 计算本期净利润（自动从收入/费用科目推算，尚未通过结账分录关账时使用）
  // 收入科目 normalBalance=CREDIT，balance = 贷方净额（正=有收入）
  // 费用科目 normalBalance=DEBIT，balance = 借方净额（正=有费用，对净利润为负）
  const totalRevenue = accountBalances
    .filter((a) => a.accountType === "REVENUE")
    .reduce((s, a) => s + a.balance, 0);
  const totalExpense = accountBalances
    .filter((a) => a.accountType === "EXPENSE")
    .reduce((s, a) => s + a.balance, 0);
  const currentPeriodProfit = totalRevenue - totalExpense; // 正=盈利，负=亏损

  // 筛选出资产负债表科目（ASSET / LIABILITY / EQUITY），排除收入/费用类
  const bsAccounts = accountBalances.filter(
    (a) =>
      ["ASSET", "LIABILITY", "EQUITY"].includes(a.accountType) &&
      a.balance !== 0
  );

  // 按 reportCategory 分组
  const grouped = new Map<string, AccountBalance[]>();
  const uncategorized: AccountBalance[] = [];

  for (const acc of bsAccounts) {
    if (
      acc.reportCategory &&
      [...ASSET_CATEGORIES, ...LIABILITY_EQUITY_CATEGORIES].includes(acc.reportCategory as Category)
    ) {
      if (!grouped.has(acc.reportCategory)) grouped.set(acc.reportCategory, []);
      grouped.get(acc.reportCategory)!.push(acc);
    } else {
      uncategorized.push(acc);
    }
  }

  // 小计：各分类
  const subtotal = (cat: string) =>
    (grouped.get(cat) ?? []).reduce((s, a) => s + a.balance, 0);

  const totalCurrentAsset     = subtotal("CURRENT_ASSET");
  const totalNonCurrentAsset  = subtotal("NON_CURRENT_ASSET");
  const totalAssets           = totalCurrentAsset + totalNonCurrentAsset;

  const totalCurrentLiab      = subtotal("CURRENT_LIABILITY");
  const totalNonCurrentLiab   = subtotal("NON_CURRENT_LIABILITY");
  const totalLiabilities      = totalCurrentLiab + totalNonCurrentLiab;

  const totalEquityBooked      = subtotal("EQUITY_ITEM");
  // 总权益 = 账面权益科目余额 + 本期净利润（未结账时在此体现）
  const totalEquity            = totalEquityBooked + currentPeriodProfit;
  const totalLiabEquity        = totalLiabilities + totalEquity;

  const isBalanced = Math.abs(totalAssets - totalLiabEquity) < 0.01;

  // 渲染一个科目分类区块
  const renderSection = (cat: string) => {
    const accounts = grouped.get(cat) ?? [];
    if (accounts.length === 0 && subtotal(cat) === 0) return null;
    return (
      <div key={cat} className="mb-3">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">
          {categoryLabel[cat] ?? cat}
        </div>
        {accounts.map((acc) => (
          <div key={acc.accountId} className="flex justify-between items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm">
            <span className="text-gray-700">
              <span className="font-mono text-xs text-gray-400 mr-2">{acc.accountCode}</span>
              {acc.accountName}
            </span>
            <span className={`font-mono tabular-nums ${acc.balance < 0 ? "text-red-500" : "text-gray-900"}`}>
              {formatAmount(acc.balance)}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const renderSubtotalRow = (label: string, amount: number) => (
    <div className="flex justify-between items-center py-1 px-2 border-t border-gray-200 text-sm font-medium">
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatAmount(amount)}</span>
    </div>
  );

  const renderTotalRow = (label: string, amount: number, highlight = false) => (
    <div
      className={`flex justify-between items-center py-1.5 px-2 border-t-2 border-gray-400 text-sm font-semibold ${
        highlight ? "bg-blue-50" : ""
      }`}
    >
      <span>{label}</span>
      <span className="font-mono tabular-nums">{formatAmount(amount)}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 期间选择 + 平衡验证 */}
      <Card>
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
            报告期间：{selectedPeriodName}（本年度累计至期末）
          </p>
          <p className="text-xs text-center text-muted-foreground">单位：元</p>
        </CardHeader>
        <CardContent className="p-4">
          {bsAccounts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {selectedPeriodId ? "该期间暂无已过账凭证" : "请选择会计期间"}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-6">
              {/* 左栏：资产 */}
              <div className="border rounded-lg p-3">
                <div className="text-sm font-bold text-center border-b pb-2 mb-3">资产</div>
                {renderSection("CURRENT_ASSET")}
                {renderSubtotalRow("流动资产合计", totalCurrentAsset)}
                <div className="mb-3" />
                {renderSection("NON_CURRENT_ASSET")}
                {renderSubtotalRow("非流动资产合计", totalNonCurrentAsset)}
                {/* 未分类资产 */}
                {uncategorized.filter((a) => a.accountType === "ASSET").length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">
                      其他资产
                    </div>
                    {uncategorized
                      .filter((a) => a.accountType === "ASSET")
                      .map((acc) => (
                        <div
                          key={acc.accountId}
                          className="flex justify-between items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm"
                        >
                          <span className="text-gray-700">
                            <span className="font-mono text-xs text-gray-400 mr-2">
                              {acc.accountCode}
                            </span>
                            {acc.accountName}
                          </span>
                          <span className={`font-mono tabular-nums ${acc.balance < 0 ? "text-red-500" : "text-gray-900"}`}>
                            {formatAmount(acc.balance)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
                {renderTotalRow("资产总计", totalAssets, true)}
              </div>

              {/* 右栏：负债 + 所有者权益 */}
              <div className="border rounded-lg p-3">
                <div className="text-sm font-bold text-center border-b pb-2 mb-3">
                  负债及所有者权益
                </div>
                <div className="mb-1 px-2 text-xs font-bold text-gray-600">负债</div>
                {renderSection("CURRENT_LIABILITY")}
                {renderSubtotalRow("流动负债合计", totalCurrentLiab)}
                <div className="mb-3" />
                {renderSection("NON_CURRENT_LIABILITY")}
                {renderSubtotalRow("非流动负债合计", totalNonCurrentLiab)}
                {/* 未分类负债 */}
                {uncategorized.filter((a) => a.accountType === "LIABILITY").length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">
                      其他负债
                    </div>
                    {uncategorized
                      .filter((a) => a.accountType === "LIABILITY")
                      .map((acc) => (
                        <div
                          key={acc.accountId}
                          className="flex justify-between items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm"
                        >
                          <span className="text-gray-700">
                            <span className="font-mono text-xs text-gray-400 mr-2">
                              {acc.accountCode}
                            </span>
                            {acc.accountName}
                          </span>
                          <span className={`font-mono tabular-nums ${acc.balance < 0 ? "text-red-500" : "text-gray-900"}`}>
                            {formatAmount(acc.balance)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
                {renderSubtotalRow("负债合计", totalLiabilities)}

                <div className="my-3 border-t border-dashed" />
                <div className="mb-1 px-2 text-xs font-bold text-gray-600">所有者权益</div>
                {renderSection("EQUITY_ITEM")}
                {/* 未分类权益 */}
                {uncategorized.filter((a) => a.accountType === "EQUITY").length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 px-2">
                      其他权益
                    </div>
                    {uncategorized
                      .filter((a) => a.accountType === "EQUITY")
                      .map((acc) => (
                        <div
                          key={acc.accountId}
                          className="flex justify-between items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm"
                        >
                          <span className="text-gray-700">
                            <span className="font-mono text-xs text-gray-400 mr-2">
                              {acc.accountCode}
                            </span>
                            {acc.accountName}
                          </span>
                          <span className={`font-mono tabular-nums ${acc.balance < 0 ? "text-red-500" : "text-gray-900"}`}>
                            {formatAmount(acc.balance)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
                {/* 本期净利润（自动推算，未结账时显示） */}
                {currentPeriodProfit !== 0 && (
                  <div className="flex justify-between items-center py-0.5 px-2 hover:bg-gray-50 rounded text-sm">
                    <span className="text-gray-500 italic">本期净利润（推算）</span>
                    <span className={`font-mono tabular-nums ${currentPeriodProfit < 0 ? "text-red-500" : "text-green-600"}`}>
                      {formatAmount(currentPeriodProfit)}
                    </span>
                  </div>
                )}
                {renderSubtotalRow("所有者权益合计", totalEquity)}
                {renderTotalRow("负债和所有者权益总计", totalLiabEquity, true)}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 平衡说明 */}
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
