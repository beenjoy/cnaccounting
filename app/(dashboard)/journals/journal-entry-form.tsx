"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Decimal from "decimal.js";
import { Plus, Trash2, AlertCircle, CheckCircle2, LayoutTemplate, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatAmount } from "@/lib/utils";

type Account = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
};

type Period = {
  id: string;
  name: string;
  year: number;
  periodNumber: number;
  status: "OPEN" | "CLOSED";
};

type Currency = {
  code: string;
  name: string;
  symbol: string;
};

type LineItem = {
  key: string;
  accountId: string;
  description: string;
  debitAmount: string;
  creditAmount: string;
  currency: string;
  exchangeRate: string;
};

type TemplateLine = {
  lineNumber: number;
  accountCode: string | null;
  accountName: string | null;
  direction: string;
  description: string | null;
};

type Template = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  lines: TemplateLine[];
};

interface JournalEntryFormProps {
  companyId: string;
  openPeriods: Period[];
  accounts: Account[];
  currencies: Currency[];
  defaultPeriodId?: string;
  exchangeRates?: Record<string, string>;
  functionalCurrency?: string;
  templates?: Template[];
}

const emptyLine = (currency = "CNY"): LineItem => ({
  key: Math.random().toString(36).slice(2),
  accountId: "",
  description: "",
  debitAmount: "",
  creditAmount: "",
  currency,
  exchangeRate: "1",
});

export function JournalEntryForm({
  companyId,
  openPeriods,
  accounts,
  currencies,
  defaultPeriodId,
  exchangeRates = {},
  functionalCurrency = "CNY",
  templates = [],
}: JournalEntryFormProps) {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [periodId, setPeriodId] = useState(defaultPeriodId || openPeriods[0]?.id || "");
  const [reference, setReference] = useState("");
  const [showTemplatePanel, setShowTemplatePanel] = useState(false);

  const selectedPeriod = openPeriods.find((p) => p.id === periodId);
  const isPeriodClosed = selectedPeriod?.status === "CLOSED";

  const handleDateChange = (date: string) => {
    setEntryDate(date);
    if (!date) return;
    const d = new Date(date + "T00:00:00");
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const matched =
      openPeriods.find((p) => p.year === year && p.periodNumber === month && p.status === "OPEN") ??
      openPeriods.find((p) => p.year === year && p.periodNumber === month);
    if (matched) setPeriodId(matched.id);
  };

  const [lines, setLines] = useState<LineItem[]>([emptyLine(), emptyLine()]);
  const [isPending, setIsPending] = useState(false);

  // Build account code → id lookup for template application
  const accountByCode = new Map(accounts.map((a) => [a.code, a.id]));

  function applyTemplate(tpl: Template) {
    const newLines: LineItem[] = tpl.lines.map((l) => {
      const accId = l.accountCode ? (accountByCode.get(l.accountCode) ?? "") : "";
      return {
        key: Math.random().toString(36).slice(2),
        accountId: accId,
        description: l.description ?? "",
        debitAmount:  l.direction === "DEBIT"  ? "" : "",
        creditAmount: l.direction === "CREDIT" ? "" : "",
        currency: functionalCurrency,
        exchangeRate: "1",
      };
    });
    setLines(newLines);
    if (!description && tpl.name) setDescription(tpl.name);
    setShowTemplatePanel(false);
    toast.success(`已应用模板「${tpl.name}」，请填写金额`);
  }

  const totalDebit = lines.reduce(
    (sum, l) => sum.plus(new Decimal(l.debitAmount || "0")),
    new Decimal(0)
  );
  const totalCredit = lines.reduce(
    (sum, l) => sum.plus(new Decimal(l.creditAmount || "0")),
    new Decimal(0)
  );
  const isBalanced = totalDebit.equals(totalCredit) && totalDebit.gt(0);
  const diff = totalDebit.minus(totalCredit);

  const addLine = () => setLines((prev) => [...prev, emptyLine(functionalCurrency)]);

  const removeLine = (key: string) => {
    if (lines.length <= 2) {
      toast.warning("凭证至少需要2行");
      return;
    }
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const updateLine = useCallback(
    (key: string, field: keyof LineItem, value: string) => {
      setLines((prev) =>
        prev.map((l) => {
          if (l.key !== key) return l;
          const updated = { ...l, [field]: value };
          if (field === "debitAmount" && value !== "") updated.creditAmount = "";
          else if (field === "creditAmount" && value !== "") updated.debitAmount = "";
          if (field === "currency") {
            updated.exchangeRate =
              value === functionalCurrency ? "1" : (exchangeRates[value] ?? "1");
          }
          return updated;
        })
      );
    },
    [exchangeRates, functionalCurrency]
  );

  const handleSubmit = async (action: "draft" | "submit") => {
    if (!description.trim()) { toast.error("请填写凭证摘要"); return; }
    if (!periodId) { toast.error("请选择会计期间"); return; }
    if (!entryDate) { toast.error("请选择凭证日期"); return; }

    const validLines = lines.filter((l) => l.accountId);
    if (validLines.length < 2) { toast.error("至少需要2条明细行"); return; }
    if (!isBalanced) { toast.error("借贷不平衡，无法提交"); return; }

    setIsPending(true);
    try {
      const response = await fetch("/api/journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          fiscalPeriodId: periodId,
          entryDate,
          description,
          reference: reference || undefined,
          status: action === "draft" ? "DRAFT" : "PENDING_APPROVAL",
          lines: validLines.map((l, i) => ({
            lineNumber: i + 1,
            accountId: l.accountId,
            description: l.description,
            debitAmount: l.debitAmount || "0",
            creditAmount: l.creditAmount || "0",
            currency: l.currency,
            exchangeRate: l.exchangeRate || "1",
          })),
        }),
      });

      const result = await response.json();
      if (!response.ok) { toast.error(result.error || "保存失败"); return; }

      toast.success(action === "draft" ? "草稿已保存" : "凭证已提交审批");
      router.push(`/journals/${result.entry.id}`);
    } catch {
      toast.error("网络错误");
    } finally {
      setIsPending(false);
    }
  };

  const accountMap = new Map(accounts.map((a) => [a.id, a]));

  // Group templates by category for panel
  const templatesByCategory = new Map<string, Template[]>();
  for (const tpl of templates) {
    const cat = tpl.category ?? "其他";
    if (!templatesByCategory.has(cat)) templatesByCategory.set(cat, []);
    templatesByCategory.get(cat)!.push(tpl);
  }

  return (
    <div className="space-y-6">
      {/* 模板面板 */}
      {showTemplatePanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="font-semibold">选择凭证模板</h2>
                <p className="text-xs text-muted-foreground mt-0.5">选择后自动填入科目，再填写金额即可</p>
              </div>
              <button onClick={() => setShowTemplatePanel(false)} className="p-1 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-6 space-y-5">
              {templates.length === 0 ? (
                <p className="text-center text-muted-foreground py-8 text-sm">
                  暂无可用模板，请到「凭证模板」页面创建或导入内置模板
                </p>
              ) : (
                Array.from(templatesByCategory.entries()).map(([cat, tpls]) => (
                  <div key={cat}>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{cat}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {tpls.map((tpl) => (
                        <button
                          key={tpl.id}
                          onClick={() => applyTemplate(tpl)}
                          className="text-left rounded-lg border px-4 py-3 hover:border-primary hover:bg-primary/5 transition-colors group"
                        >
                          <p className="font-medium text-sm group-hover:text-primary">{tpl.name}</p>
                          {tpl.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tpl.description}</p>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">
                            {tpl.lines.map((l) =>
                              `${l.direction === "DEBIT" ? "借" : "贷"} ${l.accountCode ?? ""}`
                            ).join(" / ")}
                          </p>
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 基本信息 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">凭证信息</CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowTemplatePanel(true)}
              className="gap-1.5"
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              使用模板
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="description">摘要 *</Label>
              <Input
                id="description"
                placeholder="请输入凭证摘要..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entryDate">凭证日期 *</Label>
              <Input
                id="entryDate"
                type="date"
                value={entryDate}
                onChange={(e) => handleDateChange(e.target.value)}
              />
              {/* 期间自动提示 */}
              {entryDate && selectedPeriod && (
                <p className={`text-xs mt-1 ${isPeriodClosed ? "text-orange-600" : "text-green-700"}`}>
                  对应期间：{selectedPeriod.name}
                  {isPeriodClosed ? "（已关闭）" : "（开放）"}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>会计期间 *</Label>
              <div className="flex items-center gap-2">
                <Select value={periodId} onValueChange={setPeriodId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="选择期间" />
                  </SelectTrigger>
                  <SelectContent>
                    {openPeriods.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="flex items-center gap-2">
                          {p.name}
                          {p.status === "CLOSED" && (
                            <span className="text-xs text-orange-500 font-medium">已关闭</span>
                          )}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedPeriod && (
                  <span
                    className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full ${
                      isPeriodClosed
                        ? "bg-orange-100 text-orange-700"
                        : "bg-green-100 text-green-700"
                    }`}
                  >
                    {isPeriodClosed ? "已关闭" : "开放"}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reference">参考号</Label>
              <Input
                id="reference"
                placeholder="外部单据号（可选）"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 明细行 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">凭证明细</CardTitle>
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              添加行
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-12">#</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground w-48">会计科目</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">摘要</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-36">借方金额</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground w-36">贷方金额</th>
                  <th className="text-center px-4 py-2 font-medium text-muted-foreground w-20">货币</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line, index) => {
                  const account = accountMap.get(line.accountId);
                  return (
                    <tr key={line.key} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-muted-foreground text-xs">{index + 1}</td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full h-8 text-sm rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                          value={line.accountId}
                          onChange={(e) => updateLine(line.key, "accountId", e.target.value)}
                        >
                          <option value="">-- 选择科目 --</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} {a.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          className="h-8 text-sm"
                          placeholder="行摘要（可选）"
                          value={line.description}
                          onChange={(e) => updateLine(line.key, "description", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          className="h-8 text-sm text-right font-mono"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.debitAmount}
                          onChange={(e) => updateLine(line.key, "debitAmount", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <Input
                          className="h-8 text-sm text-right font-mono"
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={line.creditAmount}
                          onChange={(e) => updateLine(line.key, "creditAmount", e.target.value)}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <select
                          className="w-full h-8 text-sm rounded border border-input bg-background px-2 focus:outline-none focus:ring-1 focus:ring-ring"
                          value={line.currency}
                          onChange={(e) => updateLine(line.key, "currency", e.target.value)}
                        >
                          {currencies.map((c) => (
                            <option key={c.code} value={c.code}>{c.code}</option>
                          ))}
                        </select>
                        {line.currency !== functionalCurrency && (
                          <div className="mt-1 space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground">汇率</span>
                              <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="w-16 h-5 text-xs rounded border border-input bg-background px-1 font-mono focus:outline-none focus:ring-1 focus:ring-ring"
                                value={line.exchangeRate}
                                onChange={(e) => updateLine(line.key, "exchangeRate", e.target.value)}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                              ≈{" "}
                              {new Decimal(line.debitAmount || line.creditAmount || "0")
                                .times(new Decimal(line.exchangeRate || "1"))
                                .toFixed(2)}{" "}
                              {functionalCurrency}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t bg-gray-50">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-medium text-right">合计</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatAmount(totalDebit)}</td>
                  <td className="px-4 py-3 text-right font-mono font-semibold">{formatAmount(totalCredit)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* 期间已关闭警告 */}
      {isPeriodClosed && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-md text-sm bg-orange-50 text-orange-700 border border-orange-200">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            所选期间「{selectedPeriod?.name}」已关闭，草稿可保存，但<strong>无法提交审批</strong>。
            如需过账，请先到「会计期间」页面重开该期间。
          </span>
        </div>
      )}

      {/* 平衡状态 */}
      <div
        className={`flex items-center gap-2 px-4 py-3 rounded-md text-sm ${
          isBalanced
            ? "bg-green-50 text-green-700 border border-green-200"
            : totalDebit.gt(0) || totalCredit.gt(0)
            ? "bg-red-50 text-red-700 border border-red-200"
            : "bg-gray-50 text-gray-500 border border-gray-200"
        }`}
      >
        {isBalanced ? (
          <><CheckCircle2 className="h-4 w-4" />借贷平衡，可以保存</>
        ) : totalDebit.gt(0) || totalCredit.gt(0) ? (
          <>
            <AlertCircle className="h-4 w-4" />
            借贷不平衡，差额：{formatAmount(diff.abs())}（{diff.gt(0) ? "借方多" : "贷方多"}）
          </>
        ) : (
          <><AlertCircle className="h-4 w-4" />请录入凭证明细</>
        )}
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-3 justify-end">
        <Button variant="outline" onClick={() => router.back()}>取消</Button>
        <Button
          variant="outline"
          disabled={isPending || !description.trim() || !periodId}
          onClick={() => handleSubmit("draft")}
        >
          保存草稿
        </Button>
        <Button
          disabled={isPending || !isBalanced || isPeriodClosed}
          onClick={() => handleSubmit("submit")}
        >
          提交审批
        </Button>
      </div>
    </div>
  );
}
