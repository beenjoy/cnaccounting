"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  currentPeriod: number;
  ytd: number;
};

interface IncomeStatementReportProps {
  periods: Period[];
  selectedPeriodId: string;
  selectedPeriodName: string;
  accountBalances: AccountBalance[];
  companyName: string;
}

// 利润表分类定义（按报表顺序）
const IS_CATEGORIES = [
  "OPERATING_REVENUE",
  "OPERATING_COST",
  "PERIOD_EXPENSE",
  "NON_OPERATING_INCOME",
  "NON_OPERATING_EXPENSE",
  "INCOME_TAX",
] as const;

type IsCategory = (typeof IS_CATEGORIES)[number];

const categoryLabel: Record<IsCategory, string> = {
  OPERATING_REVENUE:     "营业收入",
  OPERATING_COST:        "营业成本",
  PERIOD_EXPENSE:        "期间费用",
  NON_OPERATING_INCOME:  "营业外收入",
  NON_OPERATING_EXPENSE: "营业外支出",
  INCOME_TAX:            "所得税费用",
};

// 该分类在报表中是"减项"（用于显示样式）
const isDeduction = new Set<IsCategory>([
  "OPERATING_COST",
  "PERIOD_EXPENSE",
  "NON_OPERATING_EXPENSE",
  "INCOME_TAX",
]);

export function IncomeStatementReport({
  periods,
  selectedPeriodId,
  selectedPeriodName,
  accountBalances,
  companyName,
}: IncomeStatementReportProps) {
  const router = useRouter();

  const hasData = accountBalances.length > 0;

  // 按 reportCategory 分组
  const grouped = new Map<string, AccountBalance[]>();
  const uncategorized: AccountBalance[] = [];

  for (const acc of accountBalances) {
    if (acc.reportCategory && IS_CATEGORIES.includes(acc.reportCategory as IsCategory)) {
      if (!grouped.has(acc.reportCategory)) grouped.set(acc.reportCategory, []);
      grouped.get(acc.reportCategory)!.push(acc);
    } else {
      uncategorized.push(acc);
    }
  }

  // 分类小计
  const sub = (cat: string, field: "currentPeriod" | "ytd") =>
    (grouped.get(cat) ?? []).reduce((s, a) => s + a[field], 0);

  // 各项金额（本期 / 本年累计）
  const get = (cat: string) => ({
    current: sub(cat, "currentPeriod"),
    ytd: sub(cat, "ytd"),
  });

  const opRevenue    = get("OPERATING_REVENUE");
  const opCost       = get("OPERATING_COST");
  const periodExp    = get("PERIOD_EXPENSE");
  const nonOpIncome  = get("NON_OPERATING_INCOME");
  const nonOpExpense = get("NON_OPERATING_EXPENSE");
  const incomeTax    = get("INCOME_TAX");

  // 毛利润 = 营业收入 - 营业成本
  const grossProfit = {
    current: opRevenue.current - opCost.current,
    ytd: opRevenue.ytd - opCost.ytd,
  };
  // 营业利润 = 毛利润 - 期间费用
  const operatingProfit = {
    current: grossProfit.current - periodExp.current,
    ytd: grossProfit.ytd - periodExp.ytd,
  };
  // 利润总额 = 营业利润 + 营业外收入 - 营业外支出
  const profitBeforeTax = {
    current: operatingProfit.current + nonOpIncome.current - nonOpExpense.current,
    ytd: operatingProfit.ytd + nonOpIncome.ytd - nonOpExpense.ytd,
  };
  // 净利润 = 利润总额 - 所得税
  const netProfit = {
    current: profitBeforeTax.current - incomeTax.current,
    ytd: profitBeforeTax.ytd - incomeTax.ytd,
  };

  // 渲染行辅助
  const ColHeader = () => (
    <div className="grid grid-cols-[1fr_90px_90px] gap-2 py-1.5 px-2 border-b-2 border-gray-400 text-xs font-bold text-gray-600 bg-gray-50">
      <span>项目</span>
      <span className="text-right">本期数</span>
      <span className="text-right">本年累计数</span>
    </div>
  );

  const SectionHeader = ({ label, deduction = false }: { label: string; deduction?: boolean }) => (
    <div className="grid grid-cols-[1fr_90px_90px] gap-2 py-1 px-2 mt-2">
      <span className={`text-xs font-semibold uppercase tracking-wide ${deduction ? "text-orange-700" : "text-blue-700"}`}>
        {deduction ? `减：${label}` : `${label}`}
      </span>
    </div>
  );

  const DetailRow = ({ acc }: { acc: AccountBalance }) => (
    <div className="grid grid-cols-[1fr_90px_90px] gap-2 py-0.5 px-2 hover:bg-gray-50 rounded text-sm">
      <span className="text-gray-600 pl-4">
        <span className="font-mono text-xs text-gray-400 mr-2">{acc.accountCode}</span>
        {acc.accountName}
      </span>
      <span className={`text-right font-mono tabular-nums ${acc.currentPeriod < 0 ? "text-red-500" : "text-gray-800"}`}>
        {formatAmount(acc.currentPeriod)}
      </span>
      <span className={`text-right font-mono tabular-nums ${acc.ytd < 0 ? "text-red-500" : "text-gray-800"}`}>
        {formatAmount(acc.ytd)}
      </span>
    </div>
  );

  const SubtotalRow = ({ label, current, ytd, indent = false }: { label: string; current: number; ytd: number; indent?: boolean }) => (
    <div className={`grid grid-cols-[1fr_90px_90px] gap-2 py-1 px-2 border-t border-gray-200 text-sm font-medium ${indent ? "pl-4" : ""}`}>
      <span className="text-gray-700">{label}</span>
      <span className={`text-right font-mono tabular-nums ${current < 0 ? "text-red-500" : "text-gray-900"}`}>
        {formatAmount(current)}
      </span>
      <span className={`text-right font-mono tabular-nums ${ytd < 0 ? "text-red-500" : "text-gray-900"}`}>
        {formatAmount(ytd)}
      </span>
    </div>
  );

  const KeyRow = ({
    label,
    current,
    ytd,
    highlight = false,
    isNet = false,
  }: {
    label: string;
    current: number;
    ytd: number;
    highlight?: boolean;
    isNet?: boolean;
  }) => (
    <div
      className={`grid grid-cols-[1fr_90px_90px] gap-2 py-1.5 px-2 border-t-2 border-gray-400 text-sm font-semibold ${
        highlight ? (isNet && current >= 0 ? "bg-green-50" : isNet ? "bg-red-50" : "bg-blue-50") : ""
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-right font-mono tabular-nums ${
          isNet ? (current < 0 ? "text-red-600 font-bold" : "text-green-600 font-bold") : current < 0 ? "text-red-500" : "text-gray-900"
        }`}
      >
        {formatAmount(current)}
      </span>
      <span
        className={`text-right font-mono tabular-nums ${
          isNet ? (ytd < 0 ? "text-red-600 font-bold" : "text-green-600 font-bold") : ytd < 0 ? "text-red-500" : "text-gray-900"
        }`}
      >
        {formatAmount(ytd)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 期间选择器 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium">选择期间：</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedPeriodId}
              onChange={(e) =>
                router.push(`/reports/income-statement?periodId=${e.target.value}`)
              }
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}（{p.status === "OPEN" ? "开放" : "已关闭"}）
                </option>
              ))}
            </select>
            {hasData && (
              <span
                className={`text-sm font-semibold px-3 py-1 rounded-full ${
                  netProfit.current >= 0
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                本期净利润：{formatAmount(netProfit.current)}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 报表主体 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-center">{companyName} 利润表</CardTitle>
          <p className="text-xs text-center text-muted-foreground">
            报告期间：{selectedPeriodName}（本期为单月，本年累计含本期起始至期末）
          </p>
          <p className="text-xs text-center text-muted-foreground">单位：元</p>
        </CardHeader>
        <CardContent className="p-4">
          {!hasData ? (
            <div className="text-center py-12 text-muted-foreground">
              {selectedPeriodId ? "该期间暂无已过账收入/费用凭证" : "请选择会计期间"}
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden overflow-x-auto min-w-[500px]">
              <ColHeader />

              {/* ① 营业收入 */}
              <SectionHeader label="一、营业收入" />
              {(grouped.get("OPERATING_REVENUE") ?? []).map((acc) => (
                <DetailRow key={acc.accountId} acc={acc} />
              ))}
              <SubtotalRow
                label="营业收入合计"
                current={opRevenue.current}
                ytd={opRevenue.ytd}
              />

              {/* ② 营业成本 */}
              <SectionHeader label="营业成本" deduction />
              {(grouped.get("OPERATING_COST") ?? []).map((acc) => (
                <DetailRow key={acc.accountId} acc={acc} />
              ))}
              <SubtotalRow
                label="营业成本合计"
                current={opCost.current}
                ytd={opCost.ytd}
              />

              {/* 毛利润 */}
              <KeyRow
                label="二、毛利润（营业收入 - 营业成本）"
                current={grossProfit.current}
                ytd={grossProfit.ytd}
                highlight
              />

              {/* ③ 期间费用 */}
              <SectionHeader label="期间费用" deduction />
              {(grouped.get("PERIOD_EXPENSE") ?? []).map((acc) => (
                <DetailRow key={acc.accountId} acc={acc} />
              ))}
              <SubtotalRow
                label="期间费用合计"
                current={periodExp.current}
                ytd={periodExp.ytd}
              />

              {/* 营业利润 */}
              <KeyRow
                label="三、营业利润（毛利润 - 期间费用）"
                current={operatingProfit.current}
                ytd={operatingProfit.ytd}
                highlight
              />

              {/* ④ 营业外收入 */}
              {(opRevenue.current !== 0 ||
                opRevenue.ytd !== 0 ||
                (grouped.get("NON_OPERATING_INCOME") ?? []).length > 0) && (
                <>
                  <SectionHeader label="加：营业外收入" />
                  {(grouped.get("NON_OPERATING_INCOME") ?? []).map((acc) => (
                    <DetailRow key={acc.accountId} acc={acc} />
                  ))}
                  {(grouped.get("NON_OPERATING_INCOME") ?? []).length === 0 && (
                    <div className="px-2 py-0.5 text-xs text-muted-foreground pl-6">—</div>
                  )}
                </>
              )}

              {/* ⑤ 营业外支出 */}
              <SectionHeader label="营业外支出" deduction />
              {(grouped.get("NON_OPERATING_EXPENSE") ?? []).map((acc) => (
                <DetailRow key={acc.accountId} acc={acc} />
              ))}
              {(grouped.get("NON_OPERATING_EXPENSE") ?? []).length === 0 && (
                <div className="px-2 py-0.5 text-xs text-muted-foreground pl-6">—</div>
              )}

              {/* 利润总额 */}
              <KeyRow
                label="四、利润总额"
                current={profitBeforeTax.current}
                ytd={profitBeforeTax.ytd}
                highlight
              />

              {/* ⑥ 所得税 */}
              <SectionHeader label="所得税费用" deduction />
              {(grouped.get("INCOME_TAX") ?? []).map((acc) => (
                <DetailRow key={acc.accountId} acc={acc} />
              ))}
              {(grouped.get("INCOME_TAX") ?? []).length === 0 && (
                <div className="px-2 py-0.5 text-xs text-muted-foreground pl-6">—</div>
              )}

              {/* 净利润 */}
              <KeyRow
                label="五、净利润"
                current={netProfit.current}
                ytd={netProfit.ytd}
                highlight
                isNet
              />

              {/* 未分类收入/费用 */}
              {uncategorized.length > 0 && (
                <>
                  <div className="grid grid-cols-[1fr_90px_90px] gap-2 py-1 px-2 mt-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      其他未分类项目
                    </span>
                  </div>
                  {uncategorized.map((acc) => (
                    <DetailRow key={acc.accountId} acc={acc} />
                  ))}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 净利润说明 */}
      {hasData && (
        <Card className={netProfit.current < 0 ? "border-destructive" : "border-green-300"}>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-gray-800">本期净利润：</span>
              <span className={netProfit.current >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                {formatAmount(netProfit.current)}
              </span>
              <span className="mx-3">｜</span>
              <span className="font-medium text-gray-800">本年累计净利润：</span>
              <span className={netProfit.ytd >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                {formatAmount(netProfit.ytd)}
              </span>
              {uncategorized.length > 0 && (
                <span className="ml-3 text-orange-600">
                  ⚠ 存在 {uncategorized.length} 个未设置报表分类的科目，请在科目表中配置 reportCategory。
                </span>
              )}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
