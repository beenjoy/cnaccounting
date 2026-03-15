"use client";

import { useRouter } from "next/navigation";
import { Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatAmount } from "@/lib/utils";

type Period = {
  id: string;
  name: string;
  year: number;
  status: string;
};

type BalanceRow = {
  accountCode: string;
  accountName: string;
  accountType: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};

const accountTypeLabel: Record<string, string> = {
  ASSET: "资产",
  LIABILITY: "负债",
  EQUITY: "权益",
  REVENUE: "收入",
  EXPENSE: "费用",
};

interface TrialBalanceReportProps {
  periods: Period[];
  selectedPeriodId: string;
  balanceData: BalanceRow[];
  comparePeriodId?: string;
  compareData?: BalanceRow[];
}

export function TrialBalanceReport({
  periods,
  selectedPeriodId,
  balanceData,
  comparePeriodId,
  compareData = [],
}: TrialBalanceReportProps) {
  const router = useRouter();

  const totalPeriodDebit   = balanceData.reduce((s, r) => s + r.periodDebit, 0);
  const totalPeriodCredit  = balanceData.reduce((s, r) => s + r.periodCredit, 0);
  const totalClosingDebit  = balanceData.reduce((s, r) => s + r.closingDebit, 0);
  const totalClosingCredit = balanceData.reduce((s, r) => s + r.closingCredit, 0);

  const isBalanced = Math.abs(totalPeriodDebit - totalPeriodCredit) < 0.01;
  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);
  const comparePeriod  = periods.find((p) => p.id === comparePeriodId);

  // Build compare lookup: accountCode → row
  const compareMap = new Map<string, BalanceRow>();
  for (const r of compareData) compareMap.set(r.accountCode, r);

  const totalCmpDebit   = compareData.reduce((s, r) => s + r.periodDebit, 0);
  const totalCmpCredit  = compareData.reduce((s, r) => s + r.periodCredit, 0);

  const hasCompare = comparePeriodId && compareData.length > 0;

  // Navigate helper (preserve compare param)
  function navigate(newPeriodId: string, newCmpId?: string) {
    const params = new URLSearchParams();
    params.set("periodId", newPeriodId);
    if (newCmpId) params.set("comparePeriodId", newCmpId);
    router.push(`/reports/trial-balance?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      {/* 筛选 + 导出 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">当前期间：</label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={selectedPeriodId}
                onChange={(e) => navigate(e.target.value, comparePeriodId)}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">对比期间：</label>
              <select
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={comparePeriodId ?? ""}
                onChange={(e) => navigate(selectedPeriodId, e.target.value || undefined)}
              >
                <option value="">（不对比）</option>
                {periods
                  .filter((p) => p.id !== selectedPeriodId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
              </select>
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {selectedPeriod && (
                <Badge variant={selectedPeriod.status === "OPEN" ? "success" : "secondary"}>
                  {selectedPeriod.status === "OPEN" ? "期间开放" : "期间关闭"}
                </Badge>
              )}
              {balanceData.length > 0 && (
                <Badge variant={isBalanced ? "success" : "destructive"}>
                  {isBalanced ? "✓ 借贷平衡" : "✗ 借贷不平衡"}
                </Badge>
              )}
              {selectedPeriodId && (
                <a
                  href={`/api/reports/trial-balance?periodId=${selectedPeriodId}&format=csv`}
                  className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  导出 CSV
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 试算表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedPeriod?.name || ""} 试算表
            {comparePeriod && (
              <span className="font-normal text-sm text-muted-foreground ml-2">
                （对比：{comparePeriod.name}）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-24 pl-6">科目编码</TableHead>
                  <TableHead>科目名称</TableHead>
                  <TableHead className="w-16">类型</TableHead>
                  <TableHead className="text-right w-28">本期借方</TableHead>
                  <TableHead className="text-right w-28">本期贷方</TableHead>
                  {hasCompare && (
                    <>
                      <TableHead className="text-right w-28 text-muted-foreground">{comparePeriod?.name}借方</TableHead>
                      <TableHead className="text-right w-28 text-muted-foreground">{comparePeriod?.name}贷方</TableHead>
                    </>
                  )}
                  <TableHead className="text-right w-28">期末借方余额</TableHead>
                  <TableHead className="text-right w-28 pr-6">期末贷方余额</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balanceData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={hasCompare ? 9 : 7} className="text-center py-12 text-muted-foreground">
                      {selectedPeriodId ? "该期间暂无已过账凭证" : "请选择会计期间"}
                    </TableCell>
                  </TableRow>
                ) : (
                  balanceData.map((row) => {
                    const cmp = compareMap.get(row.accountCode);
                    return (
                      <TableRow key={row.accountCode}>
                        <TableCell className="pl-6 font-mono text-sm">{row.accountCode}</TableCell>
                        <TableCell className="text-sm">{row.accountName}</TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {accountTypeLabel[row.accountType]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.periodDebit > 0 ? formatAmount(row.periodDebit) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {row.periodCredit > 0 ? formatAmount(row.periodCredit) : ""}
                        </TableCell>
                        {hasCompare && (
                          <>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {cmp && cmp.periodDebit > 0 ? formatAmount(cmp.periodDebit) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm text-muted-foreground">
                              {cmp && cmp.periodCredit > 0 ? formatAmount(cmp.periodCredit) : "—"}
                            </TableCell>
                          </>
                        )}
                        <TableCell className="text-right font-mono text-sm">
                          {row.closingDebit > 0 ? formatAmount(row.closingDebit) : ""}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm pr-6">
                          {row.closingCredit > 0 ? formatAmount(row.closingCredit) : ""}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
              {balanceData.length > 0 && (
                <TableFooter>
                  <TableRow className="font-semibold bg-gray-50">
                    <TableCell colSpan={3} className="pl-6 py-3">合计</TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(totalPeriodDebit)}</TableCell>
                    <TableCell className="text-right font-mono">{formatAmount(totalPeriodCredit)}</TableCell>
                    {hasCompare && (
                      <>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatAmount(totalCmpDebit)}</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{formatAmount(totalCmpCredit)}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right font-mono">{formatAmount(totalClosingDebit)}</TableCell>
                    <TableCell className="text-right font-mono pr-6">{formatAmount(totalClosingCredit)}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
