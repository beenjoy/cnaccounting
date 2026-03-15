"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

type Currency = {
  code: string;
  name: string;
  nameEn: string | null;
  symbol: string;
  decimals: number;
  status: string;
};

type ExchangeRate = {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  rateType: string;
  effectiveDate: Date;
  source: string | null;
};

const currencySchema = z.object({
  code: z.string().length(3, "货币代码必须为3位").toUpperCase(),
  name: z.string().min(1, "请输入货币名称"),
  symbol: z.string().min(1, "请输入货币符号"),
  decimals: z.number().int().min(0).max(8).default(2),
});

const rateSchema = z.object({
  fromCurrency: z.string().length(3).toUpperCase(),
  rate: z.string().refine((v) => parseFloat(v) > 0, "汇率必须大于0"),
  rateType: z.enum(["SPOT", "AVERAGE", "CLOSING", "HISTORICAL"]),
  effectiveDate: z.string(),
});

type CurrencyForm = z.infer<typeof currencySchema>;
type RateForm = z.infer<typeof rateSchema>;

interface CurrenciesClientProps {
  currencies: Currency[];
  exchangeRates: ExchangeRate[];
  lastEcbSync: string | null;
}

const rateTypeLabel: Record<string, string> = {
  SPOT: "即期",
  AVERAGE: "平均",
  CLOSING: "期末",
  HISTORICAL: "历史",
};

export function CurrenciesClient({ currencies: initial, exchangeRates: initialRates, lastEcbSync }: CurrenciesClientProps) {
  const router = useRouter();
  const [currencies, setCurrencies] = useState(initial);
  const [rates, setRates] = useState(initialRates);
  const [currencyDialogOpen, setCurrencyDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const { register: regC, handleSubmit: handleC, reset: resetC, formState: { errors: errorsC } } =
    useForm<CurrencyForm>({ resolver: zodResolver(currencySchema), defaultValues: { decimals: 2 } });

  const { register: regR, handleSubmit: handleR, reset: resetR, setValue: setRateValue, watch: watchR, formState: { errors: errorsR } } =
    useForm<RateForm>({
      resolver: zodResolver(rateSchema),
      defaultValues: {
        rateType: "SPOT",
        effectiveDate: new Date().toISOString().slice(0, 10),
      },
    });

  const onCreateCurrency = async (data: CurrencyForm) => {
    setIsPending(true);
    try {
      const response = await fetch("/api/currencies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "创建失败");
        return;
      }
      toast.success(`货币 ${data.code} 已创建`);
      setCurrencies((prev) => [...prev, result.currency]);
      setCurrencyDialogOpen(false);
      resetC();
    } finally {
      setIsPending(false);
    }
  };

  const onCreateRate = async (data: RateForm) => {
    setIsPending(true);
    try {
      const response = await fetch("/api/exchange-rates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, toCurrency: "CNY" }),
      });
      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "保存失败");
        return;
      }
      toast.success("汇率已保存");
      setRates((prev) => [result.rate, ...prev]);
      setRateDialogOpen(false);
      resetR({ rateType: "SPOT", effectiveDate: new Date().toISOString().slice(0, 10) });
    } finally {
      setIsPending(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch("/api/exchange-rates/sync", { method: "POST" });
      const result = await response.json() as {
        synced?: number;
        date?: string;
        skipped?: string[];
        error?: string;
      };
      if (!response.ok) {
        toast.error(result.error ?? "同步失败，请稍后重试");
        return;
      }
      const skippedMsg = result.skipped && result.skipped.length > 0
        ? `（${result.skipped.join("/")} 无 ECB 数据，已跳过）`
        : "";
      toast.success(`已同步 ${result.synced} 条汇率（ECB ${result.date}）${skippedMsg}`);
      router.refresh();
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Tabs defaultValue="currencies">
      <TabsList>
        <TabsTrigger value="currencies">货币管理</TabsTrigger>
        <TabsTrigger value="rates">汇率录入</TabsTrigger>
      </TabsList>

      <TabsContent value="currencies" className="mt-4 space-y-4">
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setCurrencyDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新增货币
          </Button>
        </div>
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead className="w-16">符号</TableHead>
                <TableHead className="w-20">小数位</TableHead>
                <TableHead className="w-20">状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currencies.map((c) => (
                <TableRow key={c.code}>
                  <TableCell className="font-mono font-medium">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="font-mono">{c.symbol}</TableCell>
                  <TableCell className="text-center">{c.decimals}</TableCell>
                  <TableCell>
                    <Badge variant={c.status === "ACTIVE" ? "success" : "secondary"}>
                      {c.status === "ACTIVE" ? "启用" : "停用"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      <TabsContent value="rates" className="mt-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant="outline"
              onClick={handleSync}
              disabled={isSyncing}
            >
              <RefreshCw className={`mr-1 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "同步中..." : "同步 ECB 汇率"}
            </Button>
            {lastEcbSync && (
              <span className="text-xs text-muted-foreground">
                上次同步：{lastEcbSync}
              </span>
            )}
          </div>
          <Button size="sm" onClick={() => setRateDialogOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            录入汇率
          </Button>
        </div>
        <div className="rounded-md border bg-white">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>来源货币</TableHead>
                <TableHead>目标货币</TableHead>
                <TableHead className="text-right">汇率</TableHead>
                <TableHead className="w-24">类型</TableHead>
                <TableHead className="w-28">生效日期</TableHead>
                <TableHead className="w-20">来源</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    暂无汇率数据
                  </TableCell>
                </TableRow>
              ) : (
                rates.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono">{r.fromCurrency}</TableCell>
                    <TableCell className="font-mono">{r.toCurrency}</TableCell>
                    <TableCell className="text-right font-mono">
                      {r.rate}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{rateTypeLabel[r.rateType] || r.rateType}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(r.effectiveDate)}
                    </TableCell>
                    <TableCell>
                      {r.source === "ECB" ? (
                        <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50 text-xs">
                          ECB
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground text-xs">
                          手工
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </TabsContent>

      {/* 新增货币对话框 */}
      <Dialog open={currencyDialogOpen} onOpenChange={setCurrencyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增货币</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleC(onCreateCurrency)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">货币代码 (ISO 4217) *</Label>
                <Input id="code" placeholder="USD" {...regC("code")} className="uppercase" />
                {errorsC.code && <p className="text-xs text-red-500">{errorsC.code.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="symbol">货币符号 *</Label>
                <Input id="symbol" placeholder="$" {...regC("symbol")} />
                {errorsC.symbol && <p className="text-xs text-red-500">{errorsC.symbol.message}</p>}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">货币名称 *</Label>
              <Input id="name" placeholder="美元" {...regC("name")} />
              {errorsC.name && <p className="text-xs text-red-500">{errorsC.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="decimals">小数位数</Label>
              <Input
                id="decimals"
                type="number"
                min={0}
                max={8}
                {...regC("decimals", { valueAsNumber: true })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCurrencyDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "创建中..." : "创建"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 录入汇率对话框 */}
      <Dialog open={rateDialogOpen} onOpenChange={setRateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>录入汇率（对人民币）</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleR(onCreateRate)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>来源货币 *</Label>
                <select
                  className="w-full h-10 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  {...regR("fromCurrency")}
                >
                  <option value="">选择货币</option>
                  {currencies.filter((c) => c.code !== "CNY").map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} - {c.name}
                    </option>
                  ))}
                </select>
                {errorsR.fromCurrency && (
                  <p className="text-xs text-red-500">{errorsR.fromCurrency.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>汇率类型</Label>
                <select
                  className="w-full h-10 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  {...regR("rateType")}
                >
                  <option value="SPOT">即期汇率</option>
                  <option value="AVERAGE">平均汇率</option>
                  <option value="CLOSING">期末汇率</option>
                  <option value="HISTORICAL">历史汇率</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="rate">汇率 *（1单位外币 = ?CNY）</Label>
                <Input
                  id="rate"
                  type="number"
                  step="0.000001"
                  min="0"
                  placeholder="7.2500"
                  {...regR("rate")}
                />
                {errorsR.rate && <p className="text-xs text-red-500">{errorsR.rate.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="effectiveDate">生效日期 *</Label>
                <Input
                  id="effectiveDate"
                  type="date"
                  {...regR("effectiveDate")}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRateDialogOpen(false)}>
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
