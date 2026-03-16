"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Unlock, ChevronDown, ChevronRight, Plus, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

type FiscalPeriod = {
  id: string;
  periodNumber: number;
  name: string;
  startDate: Date;
  endDate: Date;
  status: string;
};

type FiscalYear = {
  id: string;
  year: number;
  startDate: Date;
  endDate: Date;
  isClosed: boolean;
  periods: FiscalPeriod[];
};

interface PeriodsClientProps {
  companyId: string;
  fiscalYears: FiscalYear[];
}

type PeriodAction = "open" | "soft_close" | "close";

function getPeriodBadge(status: string) {
  if (status === "OPEN")
    return <Badge variant="success" className="text-xs">开放</Badge>;
  if (status === "SOFT_CLOSE")
    return <Badge className="text-xs bg-orange-100 text-orange-700 border border-orange-300">软关账</Badge>;
  return <Badge variant="secondary" className="text-xs">已关闭</Badge>;
}

function getPeriodCardClass(status: string) {
  if (status === "OPEN") return "border-green-200 bg-green-50";
  if (status === "SOFT_CLOSE") return "border-orange-200 bg-orange-50";
  return "border-gray-200 bg-gray-50";
}

export function PeriodsClient({ companyId, fiscalYears: initial }: PeriodsClientProps) {
  const router = useRouter();
  const [fiscalYears, setFiscalYears] = useState(initial);
  const [expandedYears, setExpandedYears] = useState<Set<string>>(
    new Set(initial.slice(0, 1).map((y) => y.id))
  );
  const [pendingAction, setPendingAction] = useState<{
    periodId: string;
    action: PeriodAction;
    periodName: string;
  } | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [createYearOpen, setCreateYearOpen] = useState(false);
  const [newYear, setNewYear] = useState(String(new Date().getFullYear() + 1));

  const toggleYear = (yearId: string) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(yearId)) next.delete(yearId);
      else next.add(yearId);
      return next;
    });
  };

  const handlePeriodAction = (period: FiscalPeriod, action: PeriodAction) => {
    setPendingAction({ periodId: period.id, action, periodName: period.name });
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    if (pendingAction.action === "open" && !reopenReason.trim()) {
      toast.error("请填写重新开放原因");
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch(`/api/periods/${pendingAction.periodId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: pendingAction.action,
          reason: reopenReason,
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "操作失败");
        return;
      }

      const successMsg: Record<PeriodAction, string> = {
        soft_close: `已软关账 ${pendingAction.periodName}`,
        close: `已硬关账 ${pendingAction.periodName}`,
        open: `已重新开放 ${pendingAction.periodName}`,
      };
      toast.success(successMsg[pendingAction.action]);
      setPendingAction(null);
      setReopenReason("");
      router.refresh();

      // 乐观更新
      const newStatus: Record<PeriodAction, string> = {
        soft_close: "SOFT_CLOSE",
        close: "CLOSED",
        open: "OPEN",
      };
      setFiscalYears((prev) =>
        prev.map((fy) => ({
          ...fy,
          periods: fy.periods.map((p) =>
            p.id === pendingAction.periodId
              ? { ...p, status: newStatus[pendingAction.action] }
              : p
          ),
        }))
      );
    } finally {
      setIsPending(false);
    }
  };

  const createFiscalYear = async () => {
    const year = parseInt(newYear);
    if (isNaN(year) || year < 2000 || year > 2100) {
      toast.error("请输入有效年份（2000-2100）");
      return;
    }
    setIsPending(true);
    try {
      const response = await fetch("/api/fiscal-years", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, year }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "创建失败");
        return;
      }
      toast.success(`${year}年度已创建`);
      setCreateYearOpen(false);
      router.refresh();
    } finally {
      setIsPending(false);
    }
  };

  const getDialogTitle = (action: PeriodAction) => {
    if (action === "soft_close") return "软关账";
    if (action === "close") return "硬关账（永久关闭）";
    return "重新开放期间";
  };

  const getDialogDesc = (action: PeriodAction, periodName: string) => {
    if (action === "soft_close")
      return `确定要对 ${periodName} 执行软关账？软关账后普通用户无法录入凭证，仅会计/管理员可继续录入调整分录。`;
    if (action === "close")
      return `确定要对 ${periodName} 执行硬关账？硬关账后任何人均无法录入凭证，此操作不可逆。`;
    return `确定要重新开放 ${periodName}？请填写原因以留存审计记录。`;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateYearOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          新增会计年度
        </Button>
      </div>

      {fiscalYears.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            暂无会计年度，请新增
          </CardContent>
        </Card>
      ) : (
        fiscalYears.map((fy) => (
          <Card key={fy.id}>
            <CardHeader className="pb-2">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => toggleYear(fy.id)}
              >
                <div className="flex items-center gap-2">
                  {expandedYears.has(fy.id) ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  <CardTitle className="text-base">{fy.year}年度</CardTitle>
                  {fy.isClosed && (
                    <Badge variant="secondary">已结账</Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  {fy.periods.filter((p) => p.status === "OPEN").length} 个期间开放 /{" "}
                  {fy.periods.filter((p) => p.status === "SOFT_CLOSE").length} 个软关账
                </div>
              </div>
            </CardHeader>

            {expandedYears.has(fy.id) && (
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {fy.periods.map((period) => (
                    <div
                      key={period.id}
                      className={`rounded-md border p-3 ${getPeriodCardClass(period.status)}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium">{period.name}</span>
                        {getPeriodBadge(period.status)}
                      </div>
                      {!fy.isClosed && (
                        <div className="flex flex-col gap-1">
                          {/* OPEN 状态：显示「软关账」按钮 */}
                          {period.status === "OPEN" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs"
                              onClick={() => handlePeriodAction(period, "soft_close")}
                            >
                              <LockKeyhole className="mr-1 h-3 w-3" />
                              软关账
                            </Button>
                          )}
                          {/* SOFT_CLOSE 状态：显示「硬关账」和「重新开放」 */}
                          {period.status === "SOFT_CLOSE" && (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-xs border-red-200 text-red-600 hover:bg-red-50"
                                onClick={() => handlePeriodAction(period, "close")}
                              >
                                <Lock className="mr-1 h-3 w-3" />
                                硬关账
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="w-full h-7 text-xs"
                                onClick={() => handlePeriodAction(period, "open")}
                              >
                                <Unlock className="mr-1 h-3 w-3" />
                                重新开放
                              </Button>
                            </>
                          )}
                          {/* CLOSED 状态：显示「重新开放」 */}
                          {period.status === "CLOSED" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-7 text-xs"
                              onClick={() => handlePeriodAction(period, "open")}
                            >
                              <Unlock className="mr-1 h-3 w-3" />
                              重新开放
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>
        ))
      )}

      {/* 确认对话框 */}
      <Dialog
        open={!!pendingAction}
        onOpenChange={() => {
          setPendingAction(null);
          setReopenReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction ? getDialogTitle(pendingAction.action) : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {pendingAction
                ? getDialogDesc(pendingAction.action, pendingAction.periodName)
                : ""}
            </p>
            {pendingAction?.action === "open" && (
              <div className="space-y-1.5">
                <Label htmlFor="reason">
                  重新开放原因 <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="reason"
                  placeholder="请说明重新开放的原因..."
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)}>
              取消
            </Button>
            <Button
              variant={
                pendingAction?.action === "close"
                  ? "destructive"
                  : pendingAction?.action === "soft_close"
                  ? "default"
                  : "default"
              }
              onClick={confirmAction}
              disabled={isPending}
            >
              {isPending ? "处理中..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 创建年度对话框 */}
      <Dialog open={createYearOpen} onOpenChange={setCreateYearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增会计年度</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="year">年份</Label>
              <Input
                id="year"
                type="number"
                min={2000}
                max={2100}
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                将自动创建 1-12 月共12个期间，默认全部开放
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateYearOpen(false)}>
              取消
            </Button>
            <Button onClick={createFiscalYear} disabled={isPending}>
              {isPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
