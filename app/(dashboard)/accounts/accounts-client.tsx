"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import Link from "next/link";
import { Plus, Pencil, Search, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Account = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  normalBalance: string;
  parentId: string | null;
  level: number;
  isLeaf: boolean;
  isActive: boolean;
  reportCategory: string | null;
  description: string | null;
};

const accountTypeLabel: Record<string, string> = {
  ASSET: "资产",
  LIABILITY: "负债",
  EQUITY: "所有者权益",
  REVENUE: "收入",
  EXPENSE: "费用",
};

const accountTypeColor: Record<string, "default" | "secondary" | "info" | "success" | "warning"> = {
  ASSET: "info",
  LIABILITY: "warning",
  EQUITY: "success",
  REVENUE: "default",
  EXPENSE: "secondary",
};

// 各科目类型对应的报表分类选项
const reportCategoryOptions: Record<string, { value: string; label: string }[]> = {
  ASSET: [
    { value: "CURRENT_ASSET",     label: "流动资产" },
    { value: "NON_CURRENT_ASSET", label: "非流动资产" },
  ],
  LIABILITY: [
    { value: "CURRENT_LIABILITY",     label: "流动负债" },
    { value: "NON_CURRENT_LIABILITY", label: "非流动负债" },
  ],
  EQUITY: [
    { value: "EQUITY_ITEM", label: "所有者权益项目" },
  ],
  REVENUE: [
    { value: "OPERATING_REVENUE",    label: "营业收入" },
    { value: "NON_OPERATING_INCOME", label: "营业外收入" },
  ],
  EXPENSE: [
    { value: "OPERATING_COST",        label: "营业成本" },
    { value: "PERIOD_EXPENSE",        label: "期间费用" },
    { value: "NON_OPERATING_EXPENSE", label: "营业外支出" },
    { value: "INCOME_TAX",            label: "所得税费用" },
  ],
};

const reportCategoryLabel: Record<string, string> = {
  CURRENT_ASSET:          "流动资产",
  NON_CURRENT_ASSET:      "非流动资产",
  CURRENT_LIABILITY:      "流动负债",
  NON_CURRENT_LIABILITY:  "非流动负债",
  EQUITY_ITEM:            "所有者权益",
  OPERATING_REVENUE:      "营业收入",
  NON_OPERATING_INCOME:   "营业外收入",
  OPERATING_COST:         "营业成本",
  PERIOD_EXPENSE:         "期间费用",
  NON_OPERATING_EXPENSE:  "营业外支出",
  INCOME_TAX:             "所得税",
};

const REPORT_CATEGORIES = [
  "CURRENT_ASSET", "NON_CURRENT_ASSET",
  "CURRENT_LIABILITY", "NON_CURRENT_LIABILITY",
  "EQUITY_ITEM",
  "OPERATING_REVENUE", "NON_OPERATING_INCOME",
  "OPERATING_COST", "PERIOD_EXPENSE", "NON_OPERATING_EXPENSE", "INCOME_TAX",
] as const;

const schema = z.object({
  code: z.string().min(1, "科目编码不能为空").max(20),
  name: z.string().min(1, "科目名称不能为空").max(100),
  accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  normalBalance: z.enum(["DEBIT", "CREDIT"]),
  parentId: z.string().optional(),
  isLeaf: z.boolean(),
  reportCategory: z.enum(REPORT_CATEGORIES).optional().nullable(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface AccountsClientProps {
  companyId: string;
  initialAccounts: Account[];
}

export function AccountsClient({ companyId, initialAccounts }: AccountsClientProps) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [isPending, setIsPending] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { isLeaf: true },
  });

  const watchedType = watch("accountType");
  const watchedCategory = watch("reportCategory");

  const filtered = accounts.filter(
    (a) =>
      a.code.includes(search) ||
      a.name.includes(search) ||
      accountTypeLabel[a.accountType]?.includes(search)
  );

  const openCreate = () => {
    setEditingAccount(null);
    reset({ isLeaf: true, reportCategory: null });
    setDialogOpen(true);
  };

  const openEdit = (account: Account) => {
    setEditingAccount(account);
    reset({
      code: account.code,
      name: account.name,
      accountType: account.accountType as FormData["accountType"],
      normalBalance: account.normalBalance as FormData["normalBalance"],
      parentId: account.parentId ?? undefined,
      isLeaf: account.isLeaf,
      reportCategory: (account.reportCategory as FormData["reportCategory"]) ?? null,
      description: account.description ?? undefined,
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: FormData) => {
    setIsPending(true);
    try {
      const url = editingAccount
        ? `/api/accounts/${editingAccount.id}`
        : "/api/accounts";
      const method = editingAccount ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, companyId }),
      });

      const result = await response.json();

      if (!response.ok) {
        toast.error(result.error || "操作失败");
        return;
      }

      toast.success(editingAccount ? "科目已更新" : "科目已创建");
      setDialogOpen(false);
      router.refresh();

      // 乐观更新
      if (editingAccount) {
        setAccounts((prev) =>
          prev.map((a) => (a.id === editingAccount.id ? { ...a, ...data } : a))
        );
      } else {
        setAccounts((prev) => [...prev, result.account]);
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 搜索和操作栏 */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="搜索科目编码、名称..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={openCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          新增科目
        </Button>
      </div>

      {/* 科目表格 */}
      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-32">科目编码</TableHead>
              <TableHead>科目名称</TableHead>
              <TableHead className="w-32">科目类型</TableHead>
              <TableHead className="w-28">报表分类</TableHead>
              <TableHead className="w-24">借贷方向</TableHead>
              <TableHead className="w-20">末级</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  {search ? "未找到匹配科目" : "暂无科目，请新增"}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((account) => (
                <TableRow key={account.id}>
                  <TableCell className="font-mono text-sm font-medium">
                    {account.code}
                  </TableCell>
                  <TableCell>{account.name}</TableCell>
                  <TableCell>
                    <Badge variant={accountTypeColor[account.accountType] || "secondary"}>
                      {accountTypeLabel[account.accountType]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {account.reportCategory
                      ? reportCategoryLabel[account.reportCategory] ?? account.reportCategory
                      : <span className="text-gray-300">—</span>}
                  </TableCell>
                  <TableCell className="text-sm">
                    {account.normalBalance === "DEBIT" ? "借方" : "贷方"}
                  </TableCell>
                  <TableCell>
                    {account.isLeaf ? (
                      <span className="text-green-600 text-xs">是</span>
                    ) : (
                      <span className="text-gray-400 text-xs">否</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {account.isActive ? (
                      <span className="text-green-600 text-xs">启用</span>
                    ) : (
                      <span className="text-red-500 text-xs">停用</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEdit(account)}
                        className="h-7 w-7 p-0"
                        title="编辑科目"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {account.isLeaf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 w-7 p-0"
                          title="查看明细账"
                        >
                          <Link href={`/ledger?accountId=${account.id}`}>
                            <BookOpen className="h-3.5 w-3.5" />
                          </Link>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 创建/编辑对话框 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? "编辑科目" : "新增科目"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="code">科目编码 *</Label>
                <Input id="code" placeholder="1001" {...register("code")} />
                {errors.code && (
                  <p className="text-xs text-red-500">{errors.code.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="name">科目名称 *</Label>
                <Input id="name" placeholder="库存现金" {...register("name")} />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>科目类型 *</Label>
                <Select
                  value={watchedType}
                  onValueChange={(v) => {
                    setValue("accountType", v as FormData["accountType"]);
                    // 自动设置借贷方向
                    if (v === "ASSET" || v === "EXPENSE") {
                      setValue("normalBalance", "DEBIT");
                    } else {
                      setValue("normalBalance", "CREDIT");
                    }
                    // 清空报表分类（切换类型后需重新选）
                    setValue("reportCategory", null);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ASSET">资产</SelectItem>
                    <SelectItem value="LIABILITY">负债</SelectItem>
                    <SelectItem value="EQUITY">所有者权益</SelectItem>
                    <SelectItem value="REVENUE">收入</SelectItem>
                    <SelectItem value="EXPENSE">费用</SelectItem>
                  </SelectContent>
                </Select>
                {errors.accountType && (
                  <p className="text-xs text-red-500">{errors.accountType.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>借贷方向 *</Label>
                <Select
                  value={watch("normalBalance")}
                  onValueChange={(v) =>
                    setValue("normalBalance", v as "DEBIT" | "CREDIT")
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择方向" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DEBIT">借方</SelectItem>
                    <SelectItem value="CREDIT">贷方</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* 报表分类 - 根据科目类型动态显示选项 */}
            {watchedType && reportCategoryOptions[watchedType] && (
              <div className="space-y-1.5">
                <Label>报表分类</Label>
                <Select
                  value={watchedCategory ?? ""}
                  onValueChange={(v) =>
                    setValue("reportCategory", v as FormData["reportCategory"])
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择报表分类（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    {reportCategoryOptions[watchedType].map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  用于资产负债表和利润表的分组归类
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="description">备注</Label>
              <Input
                id="description"
                placeholder="可选备注说明"
                {...register("description")}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isLeaf"
                className="h-4 w-4"
                checked={watch("isLeaf")}
                onChange={(e) => setValue("isLeaf", e.target.checked)}
              />
              <Label htmlFor="isLeaf" className="cursor-pointer">
                末级科目（可直接记账）
              </Label>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "保存中..." : "保存"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
