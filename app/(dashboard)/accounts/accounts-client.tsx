"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Plus, Pencil, Search } from "lucide-react";
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

const schema = z.object({
  code: z.string().min(1, "科目编码不能为空").max(20),
  name: z.string().min(1, "科目名称不能为空").max(100),
  accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  normalBalance: z.enum(["DEBIT", "CREDIT"]),
  parentId: z.string().optional(),
  isLeaf: z.boolean(),
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

  const filtered = accounts.filter(
    (a) =>
      a.code.includes(search) ||
      a.name.includes(search) ||
      accountTypeLabel[a.accountType]?.includes(search)
  );

  const openCreate = () => {
    setEditingAccount(null);
    reset({ isLeaf: true });
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
              <TableHead className="w-24">借贷方向</TableHead>
              <TableHead className="w-20">末级</TableHead>
              <TableHead className="w-20">状态</TableHead>
              <TableHead className="w-20">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(account)}
                      className="h-7 w-7 p-0"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
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
