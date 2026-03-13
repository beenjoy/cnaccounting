"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatAmount } from "@/lib/utils";
import type { CashFlowItem } from "./page";

type Period = {
  id: string;
  name: string;
  year: number;
  status: string;
};

interface CashFlowReportProps {
  periods: Period[];
  selectedPeriodId: string;
  selectedPeriodName: string;
  selectedPeriodNumber: number;
  cashFlowItems: CashFlowItem[];
  openingBalance: number;
  companyName: string;
}

const ACTIVITY_LABEL: Record<string, string> = {
  OPERATING:  "一、经营活动产生的现金流量",
  INVESTING:  "二、投资活动产生的现金流量",
  FINANCING:  "三、筹资活动产生的现金流量",
};

const ACTIVITY_NET_LABEL: Record<string, string> = {
  OPERATING: "经营活动现金流量净额",
  INVESTING: "投资活动现金流量净额",
  FINANCING: "筹资活动现金流量净额",
};

const ACTIVITY_ORDER = ["OPERATING", "INVESTING", "FINANCING"] as const;

export function CashFlowReport({
  periods,
  selectedPeriodId,
  selectedPeriodName,
  selectedPeriodNumber,
  cashFlowItems,
  openingBalance,
  companyName,
}: CashFlowReportProps) {
  const router = useRouter();

  // 按活动分组，再按流入/流出分组
  const grouped = new Map<string, { inflows: CashFlowItem[]; outflows: CashFlowItem[] }>();
  for (const act of ACTIVITY_ORDER) {
    grouped.set(act, { inflows: [], outflows: [] });
  }

  for (const item of cashFlowItems) {
    const g = grouped.get(item.activity)!;
    if (item.amount >= 0) g.inflows.push(item);
    else g.outflows.push(item);
  }

  // 各活动净额
  const netByActivity = (act: string) =>
    (grouped.get(act)?.inflows ?? []).reduce((s, i) => s + i.amount, 0) +
    (grouped.get(act)?.outflows ?? []).reduce((s, i) => s + i.amount, 0);

  const netOperating  = netByActivity("OPERATING");
  const netInvesting  = netByActivity("INVESTING");
  const netFinancing  = netByActivity("FINANCING");
  const totalNetFlow  = netOperating + netInvesting + netFinancing;
  const closingBalance = openingBalance + totalNetFlow;

  const autoClassifiedCount = cashFlowItems.filter((i) => i.isAutoClassified).length;
  const hasData = cashFlowItems.length > 0;

  // ---- 渲染辅助 ----

  const ItemRow = ({ item }: { item: CashFlowItem }) => (
    <div className="grid grid-cols-[1fr_100px] gap-2 py-0.5 px-2 hover:bg-gray-50 rounded text-sm">
      <div className="flex items-center gap-1.5 text-gray-600 pl-4 min-w-0">
        <span className="font-mono text-xs text-gray-400 shrink-0">{item.entryNumber}</span>
        <span className="truncate">{item.entryDescription || item.counterpartSummary}</span>
        {item.isAutoClassified && (
          <span className="text-xs text-orange-500 shrink-0">[自动]</span>
        )}
      </div>
      <span
        className={`text-right font-mono tabular-nums shrink-0 ${
          item.amount >= 0 ? "text-green-700" : "text-red-500"
        }`}
      >
        {item.amount >= 0 ? "+" : ""}
        {formatAmount(item.amount)}
      </span>
    </div>
  );

  const SubtotalRow = ({ label, amount, indent = false }: { label: string; amount: number; indent?: boolean }) => (
    <div
      className={`grid grid-cols-[1fr_100px] gap-2 py-1 px-2 border-t border-gray-200 text-sm font-medium ${
        indent ? "pl-4" : ""
      }`}
    >
      <span className="text-gray-700">{label}</span>
      <span className={`text-right font-mono tabular-nums ${amount < 0 ? "text-red-500" : "text-gray-900"}`}>
        {formatAmount(amount)}
      </span>
    </div>
  );

  const KeyRow = ({
    label,
    amount,
    highlight = false,
  }: {
    label: string;
    amount: number;
    highlight?: boolean;
  }) => (
    <div
      className={`grid grid-cols-[1fr_100px] gap-2 py-1.5 px-2 border-t-2 border-gray-400 text-sm font-semibold ${
        highlight ? "bg-blue-50" : ""
      }`}
    >
      <span>{label}</span>
      <span className={`text-right font-mono tabular-nums ${amount < 0 ? "text-red-500" : "text-gray-900"}`}>
        {formatAmount(amount)}
      </span>
    </div>
  );

  const BalanceRow = ({
    label,
    amount,
    isClosing = false,
  }: {
    label: string;
    amount: number;
    isClosing?: boolean;
  }) => (
    <div
      className={`grid grid-cols-[1fr_100px] gap-2 py-1.5 px-2 text-sm font-semibold ${
        isClosing ? "border-t-2 border-gray-600 bg-slate-50" : "border-t border-gray-200"
      }`}
    >
      <span>{label}</span>
      <span
        className={`text-right font-mono tabular-nums ${
          isClosing
            ? amount < 0
              ? "text-red-600 font-bold"
              : "text-blue-700 font-bold"
            : "text-gray-700"
        }`}
      >
        {formatAmount(amount)}
      </span>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* 期间选择器 */}
      <Card className="no-print">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium">选择期间：</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedPeriodId}
              onChange={(e) =>
                router.push(`/reports/cash-flow?periodId=${e.target.value}`)
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
                  totalNetFlow >= 0
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                本年累计净现金流：{totalNetFlow >= 0 ? "+" : ""}
                {formatAmount(totalNetFlow)}
              </span>
            )}
            {autoClassifiedCount > 0 && (
              <Badge variant="secondary" className="text-orange-600 border-orange-200 bg-orange-50">
                {autoClassifiedCount} 笔自动归类
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
          <CardTitle className="text-base text-center">{companyName} 现金流量表</CardTitle>
          <p className="text-xs text-center text-muted-foreground">
            报告期间：{selectedPeriodName}（本年度累计至期末，直接法）
          </p>
          <p className="text-xs text-center text-muted-foreground">单位：元</p>
        </CardHeader>
        <CardContent className="p-4">
          {!hasData ? (
            <div className="text-center py-12 text-muted-foreground">
              {selectedPeriodId
                ? "该期间暂无涉及现金科目（1001/1002）的已过账凭证"
                : "请选择会计期间"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="border rounded-lg overflow-hidden min-w-[420px]">
                {/* 列标题 */}
                <div className="grid grid-cols-[1fr_100px] gap-2 py-1.5 px-2 border-b-2 border-gray-400 text-xs font-bold text-gray-600 bg-gray-50">
                  <span>项目</span>
                  <span className="text-right">本年累计金额</span>
                </div>

                {/* 三大活动区块 */}
                {ACTIVITY_ORDER.map((act) => {
                  const { inflows, outflows } = grouped.get(act)!;
                  const totalInflow  = inflows.reduce((s, i) => s + i.amount, 0);
                  const totalOutflow = outflows.reduce((s, i) => s + i.amount, 0);
                  const net = totalInflow + totalOutflow;

                  return (
                    <div key={act}>
                      {/* 活动标题 */}
                      <div className="grid grid-cols-[1fr_100px] gap-2 py-1.5 px-2 mt-1 bg-gray-50">
                        <span className="text-sm font-bold text-gray-700">
                          {ACTIVITY_LABEL[act]}
                        </span>
                      </div>

                      {/* 现金流入 */}
                      {inflows.length > 0 && (
                        <>
                          <div className="px-2 py-0.5 text-xs font-semibold text-blue-600 mt-1 pl-4">
                            现金流入
                          </div>
                          {inflows.map((item, idx) => (
                            <ItemRow key={`${item.entryId}-${idx}`} item={item} />
                          ))}
                          <SubtotalRow
                            label="现金流入小计"
                            amount={totalInflow}
                            indent
                          />
                        </>
                      )}

                      {/* 现金流出 */}
                      {outflows.length > 0 && (
                        <>
                          <div className="px-2 py-0.5 text-xs font-semibold text-red-600 mt-1 pl-4">
                            现金流出
                          </div>
                          {outflows.map((item, idx) => (
                            <ItemRow key={`${item.entryId}-out-${idx}`} item={item} />
                          ))}
                          <SubtotalRow
                            label="现金流出小计"
                            amount={totalOutflow}
                            indent
                          />
                        </>
                      )}

                      {inflows.length === 0 && outflows.length === 0 && (
                        <div className="px-2 py-1 text-xs text-muted-foreground pl-6">—</div>
                      )}

                      {/* 活动净额 */}
                      <KeyRow
                        label={ACTIVITY_NET_LABEL[act]}
                        amount={net}
                        highlight
                      />
                    </div>
                  );
                })}

                {/* 汇率影响（占位，若无多币种数据则为0） */}
                <div className="grid grid-cols-[1fr_100px] gap-2 py-1 px-2 border-t border-gray-200 text-sm text-muted-foreground">
                  <span>四、汇率变动对现金的影响</span>
                  <span className="text-right font-mono tabular-nums">0.00</span>
                </div>

                {/* 现金余额汇总 */}
                <div className="mt-2">
                  <KeyRow
                    label="五、现金及现金等价物净增加额"
                    amount={totalNetFlow}
                    highlight
                  />
                  <BalanceRow label="加：期初现金及现金等价物余额" amount={openingBalance} />
                  <BalanceRow
                    label="六、期末现金及现金等价物余额"
                    amount={closingBalance}
                    isClosing
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 补充说明 */}
      {hasData && (
        <Card className="border-blue-200">
          <CardContent className="pt-4 space-y-1">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-gray-800">期初余额：</span>
              {formatAmount(openingBalance)}
              <span className="mx-3">｜</span>
              <span className="font-medium text-gray-800">本年净现金流：</span>
              <span className={totalNetFlow >= 0 ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
                {totalNetFlow >= 0 ? "+" : ""}
                {formatAmount(totalNetFlow)}
              </span>
              <span className="mx-3">｜</span>
              <span className="font-medium text-gray-800">期末余额：</span>
              <span className={closingBalance < 0 ? "text-red-600 font-semibold" : "text-blue-700 font-semibold"}>
                {formatAmount(closingBalance)}
              </span>
            </p>
            {autoClassifiedCount > 0 && (
              <p className="text-xs text-orange-600">
                ⚠ 共 {autoClassifiedCount} 笔凭证行未设置 cashFlowActivity，已根据对方科目类型自动归类。
                如需精确分类，请在凭证录入时为现金科目行手动指定活动类别。
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
