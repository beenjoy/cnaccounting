"use client";

import { useRouter, useSearchParams } from "next/navigation";
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
}

export function TrialBalanceReport({
  periods,
  selectedPeriodId,
  balanceData,
}: TrialBalanceReportProps) {
  const router = useRouter();

  const totalPeriodDebit = balanceData.reduce((s, r) => s + r.periodDebit, 0);
  const totalPeriodCredit = balanceData.reduce((s, r) => s + r.periodCredit, 0);
  const totalClosingDebit = balanceData.reduce((s, r) => s + r.closingDebit, 0);
  const totalClosingCredit = balanceData.reduce((s, r) => s + r.closingCredit, 0);

  const isBalanced = Math.abs(totalPeriodDebit - totalPeriodCredit) < 0.01;

  const selectedPeriod = periods.find((p) => p.id === selectedPeriodId);

  return (
    <div className="space-y-4">
      {/* 期间选择器 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">选择期间：</label>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedPeriodId}
              onChange={(e) => router.push(`/reports/trial-balance?periodId=${e.target.value}`)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status === "OPEN" ? "开放" : "已关闭"})
                </option>
              ))}
            </select>
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
          </div>
        </CardContent>
      </Card>

      {/* 试算表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {selectedPeriod?.name || ""} 试算表
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="w-24 pl-6">科目编码</TableHead>
                <TableHead>科目名称</TableHead>
                <TableHead className="w-20">类型</TableHead>
                <TableHead className="text-right w-32">本期借方</TableHead>
                <TableHead className="text-right w-32">本期贷方</TableHead>
                <TableHead className="text-right w-32">期末借方余额</TableHead>
                <TableHead className="text-right w-32 pr-6">期末贷方余额</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {balanceData.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    {selectedPeriodId
                      ? "该期间暂无已过账凭证"
                      : "请选择会计期间"}
                  </TableCell>
                </TableRow>
              ) : (
                balanceData.map((row) => (
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
                    <TableCell className="text-right font-mono text-sm">
                      {row.closingDebit > 0 ? formatAmount(row.closingDebit) : ""}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm pr-6">
                      {row.closingCredit > 0 ? formatAmount(row.closingCredit) : ""}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            {balanceData.length > 0 && (
              <TableFooter>
                <TableRow className="font-semibold bg-gray-50">
                  <TableCell colSpan={3} className="pl-6 py-3">合计</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatAmount(totalPeriodDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatAmount(totalPeriodCredit)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatAmount(totalClosingDebit)}
                  </TableCell>
                  <TableCell className="text-right font-mono pr-6">
                    {formatAmount(totalClosingCredit)}
                  </TableCell>
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
