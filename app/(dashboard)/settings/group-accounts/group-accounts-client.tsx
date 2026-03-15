"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, ChevronRight, Trash2, Network, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

type AccountType = "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE";
type NormalBalance = "DEBIT" | "CREDIT";
type MappingType = "DIRECT" | "RANGE";

interface GroupAccount {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  parentId: string | null;
  level: number;
  isLeaf: boolean;
  reportCategory: string | null;
  description: string | null;
  childCount: number;
  mappingCount: number;
}

interface GroupAccountMapping {
  id: string;
  mappingType: MappingType;
  localCode: string | null;
  rangeStart: string | null;
  rangeEnd: string | null;
  priority: number;
  company: { id: string; name: string };
}

interface Company {
  id: string;
  name: string;
}

interface Props {
  initialAccounts: GroupAccount[];
  companies: Company[];
  canEdit: boolean;
}

// ── Labels ─────────────────────────────────────────────────────────────────────

const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  ASSET: "资产",
  LIABILITY: "负债",
  EQUITY: "所有者权益",
  REVENUE: "收入",
  EXPENSE: "费用",
};

const NORMAL_BALANCE_LABELS: Record<NormalBalance, string> = {
  DEBIT: "借方",
  CREDIT: "贷方",
};

const REPORT_CATEGORIES: Record<AccountType, Array<{ value: string; label: string }>> = {
  ASSET: [
    { value: "CURRENT_ASSET", label: "流动资产" },
    { value: "NON_CURRENT_ASSET", label: "非流动资产" },
  ],
  LIABILITY: [
    { value: "CURRENT_LIABILITY", label: "流动负债" },
    { value: "NON_CURRENT_LIABILITY", label: "非流动负债" },
  ],
  EQUITY: [{ value: "EQUITY_ITEM", label: "所有者权益项目" }],
  REVENUE: [
    { value: "OPERATING_REVENUE", label: "营业收入" },
    { value: "NON_OPERATING_INCOME", label: "营业外收入" },
  ],
  EXPENSE: [
    { value: "OPERATING_COST", label: "营业成本" },
    { value: "PERIOD_EXPENSE", label: "期间费用" },
    { value: "NON_OPERATING_EXPENSE", label: "营业外支出" },
    { value: "INCOME_TAX", label: "所得税" },
  ],
};

const DEFAULT_NORMAL_BALANCE: Record<AccountType, NormalBalance> = {
  ASSET: "DEBIT",
  LIABILITY: "CREDIT",
  EQUITY: "CREDIT",
  REVENUE: "CREDIT",
  EXPENSE: "DEBIT",
};

const ACCOUNT_TYPE_COLORS: Record<AccountType, string> = {
  ASSET: "text-blue-600",
  LIABILITY: "text-red-600",
  EQUITY: "text-purple-600",
  REVENUE: "text-green-600",
  EXPENSE: "text-orange-600",
};

// ── Tree building ──────────────────────────────────────────────────────────────

interface TreeNode extends GroupAccount {
  children: TreeNode[];
}

function buildTree(accounts: GroupAccount[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  accounts.forEach((a) => map.set(a.id, { ...a, children: [] }));
  const roots: TreeNode[] = [];
  accounts.forEach((a) => {
    const node = map.get(a.id)!;
    if (a.parentId && map.has(a.parentId)) {
      map.get(a.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
}

// ── AccountTree component ──────────────────────────────────────────────────────

function AccountTree({
  nodes,
  selectedId,
  onSelect,
  expandedIds,
  onToggleExpand,
}: {
  nodes: TreeNode[];
  selectedId: string | null;
  onSelect: (account: GroupAccount) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <Network className="h-10 w-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">暂无集团科目</p>
        <p className="text-xs mt-1">点击右上角"新建集团科目"开始创建</p>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <AccountTreeNode
          key={node.id}
          node={node}
          selectedId={selectedId}
          onSelect={onSelect}
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          depth={0}
        />
      ))}
    </div>
  );
}

function AccountTreeNode({
  node,
  selectedId,
  onSelect,
  expandedIds,
  onToggleExpand,
  depth,
}: {
  node: TreeNode;
  selectedId: string | null;
  onSelect: (account: GroupAccount) => void;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  depth: number;
}) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = node.id === selectedId;
  const hasChildren = node.children.length > 0 || !node.isLeaf;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors group",
          isSelected
            ? "bg-primary/10 text-primary"
            : "hover:bg-muted/60 text-foreground"
        )}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        {/* Expand/collapse toggle */}
        <button
          type="button"
          className="h-4 w-4 shrink-0 flex items-center justify-center"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren || node.children.length > 0) {
              onToggleExpand(node.id);
            }
          }}
        >
          {hasChildren || node.children.length > 0 ? (
            <ChevronRight
              className={cn(
                "h-3.5 w-3.5 text-muted-foreground transition-transform duration-150",
                isExpanded && "rotate-90"
              )}
            />
          ) : (
            <span className="h-3.5 w-3.5 block" />
          )}
        </button>

        {/* Code + Name */}
        <span className="font-mono text-xs text-muted-foreground shrink-0">
          {node.code}
        </span>
        <span className="text-sm truncate flex-1">{node.name}</span>

        {/* Mapping count badge */}
        {node.mappingCount > 0 && (
          <Badge variant="secondary" className="text-xs h-4 px-1 shrink-0">
            {node.mappingCount}
          </Badge>
        )}
      </div>

      {/* Children */}
      <div
        className={cn(
          "grid transition-all duration-150 ease-in-out",
          isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          {node.children.map((child) => (
            <AccountTreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              depth={depth + 1}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main client component ──────────────────────────────────────────────────────

export function GroupAccountsClient({ initialAccounts, companies, canEdit }: Props) {
  const [accounts, setAccounts] = useState<GroupAccount[]>(initialAccounts);
  const [selectedAccount, setSelectedAccount] = useState<GroupAccount | null>(null);
  const [mappings, setMappings] = useState<GroupAccountMapping[]>([]);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Dialogs
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newMappingOpen, setNewMappingOpen] = useState(false);

  // New account form state
  const [form, setForm] = useState({
    code: "",
    name: "",
    accountType: "ASSET" as AccountType,
    normalBalance: "DEBIT" as NormalBalance,
    parentId: "",
    isLeaf: true,
    reportCategory: "",
    description: "",
  });
  const [formPending, setFormPending] = useState(false);

  // New mapping form state
  const [mappingForm, setMappingForm] = useState({
    companyId: "",
    mappingType: "DIRECT" as MappingType,
    localCode: "",
    rangeStart: "",
    rangeEnd: "",
    priority: 0,
  });
  const [mappingPending, setMappingPending] = useState(false);

  // ── Tree ──────────────────────────────────────────────────────────────────

  const tree = buildTree(accounts);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Select account + load mappings ────────────────────────────────────────

  const handleSelectAccount = useCallback(async (account: GroupAccount) => {
    setSelectedAccount(account);
    setMappings([]);
    setLoadingMappings(true);
    try {
      const res = await fetch(`/api/group-account-mappings?groupAccountId=${account.id}`);
      if (res.ok) {
        const data = await res.json() as { mappings: GroupAccountMapping[] };
        setMappings(data.mappings);
      }
    } finally {
      setLoadingMappings(false);
    }
  }, []);

  // ── Create group account ──────────────────────────────────────────────────

  async function handleCreateAccount() {
    setFormPending(true);
    try {
      const res = await fetch("/api/group-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: form.code,
          name: form.name,
          accountType: form.accountType,
          normalBalance: form.normalBalance,
          parentId: form.parentId || null,
          isLeaf: form.isLeaf,
          reportCategory: form.reportCategory || null,
          description: form.description || null,
        }),
      });
      const result = await res.json() as { account?: GroupAccount; error?: string };
      if (!res.ok) {
        toast.error(result.error ?? "创建失败");
        return;
      }
      toast.success(`集团科目 ${form.code} 已创建`);
      // Update accounts list (and refresh parent's isLeaf if needed)
      setAccounts((prev) => {
        const next = [...prev, { ...result.account!, childCount: 0, mappingCount: 0 }];
        if (form.parentId) {
          return next.map((a) =>
            a.id === form.parentId ? { ...a, isLeaf: false, childCount: a.childCount + 1 } : a
          );
        }
        return next;
      });
      setNewAccountOpen(false);
      setForm({
        code: "", name: "", accountType: "ASSET", normalBalance: "DEBIT",
        parentId: "", isLeaf: true, reportCategory: "", description: "",
      });
    } finally {
      setFormPending(false);
    }
  }

  // ── Delete group account ──────────────────────────────────────────────────

  async function handleDeleteAccount(account: GroupAccount) {
    if (!confirm(`确定删除集团科目 ${account.code} ${account.name}？`)) return;
    const res = await fetch(`/api/group-accounts/${account.id}`, { method: "DELETE" });
    const result = await res.json() as { error?: string };
    if (!res.ok) {
      toast.error(result.error ?? "删除失败");
      return;
    }
    toast.success("集团科目已删除");
    setAccounts((prev) => prev.filter((a) => a.id !== account.id));
    if (selectedAccount?.id === account.id) {
      setSelectedAccount(null);
      setMappings([]);
    }
  }

  // ── Create mapping ────────────────────────────────────────────────────────

  async function handleCreateMapping() {
    if (!selectedAccount) return;
    setMappingPending(true);
    try {
      const body =
        mappingForm.mappingType === "DIRECT"
          ? {
              groupAccountId: selectedAccount.id,
              companyId: mappingForm.companyId,
              mappingType: "DIRECT" as const,
              localCode: mappingForm.localCode,
              priority: mappingForm.priority,
            }
          : {
              groupAccountId: selectedAccount.id,
              companyId: mappingForm.companyId,
              mappingType: "RANGE" as const,
              rangeStart: mappingForm.rangeStart,
              rangeEnd: mappingForm.rangeEnd,
              priority: mappingForm.priority,
            };

      const res = await fetch("/api/group-account-mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json() as { mapping?: GroupAccountMapping; error?: string };
      if (!res.ok) {
        toast.error(result.error ?? "保存失败");
        return;
      }
      toast.success("映射已保存");
      setMappings((prev) => [...prev, result.mapping!]);
      // Update mapping count on account
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === selectedAccount.id ? { ...a, mappingCount: a.mappingCount + 1 } : a
        )
      );
      setSelectedAccount((prev) =>
        prev ? { ...prev, mappingCount: prev.mappingCount + 1 } : prev
      );
      setNewMappingOpen(false);
      setMappingForm({ companyId: "", mappingType: "DIRECT", localCode: "", rangeStart: "", rangeEnd: "", priority: 0 });
    } finally {
      setMappingPending(false);
    }
  }

  // ── Delete mapping ────────────────────────────────────────────────────────

  async function handleDeleteMapping(mappingId: string) {
    if (!confirm("确定删除此映射？")) return;
    const res = await fetch(`/api/group-account-mappings/${mappingId}`, { method: "DELETE" });
    const result = await res.json() as { error?: string };
    if (!res.ok) {
      toast.error(result.error ?? "删除失败");
      return;
    }
    toast.success("映射已删除");
    setMappings((prev) => prev.filter((m) => m.id !== mappingId));
    if (selectedAccount) {
      setAccounts((prev) =>
        prev.map((a) =>
          a.id === selectedAccount.id ? { ...a, mappingCount: Math.max(0, a.mappingCount - 1) } : a
        )
      );
      setSelectedAccount((prev) =>
        prev ? { ...prev, mappingCount: Math.max(0, prev.mappingCount - 1) } : prev
      );
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex justify-end">
        {canEdit && (
          <Button size="sm" onClick={() => setNewAccountOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            新建集团科目
          </Button>
        )}
      </div>

      {/* Split layout */}
      <div className="flex gap-4 min-h-[500px]">
        {/* Left: Tree */}
        <div className="w-72 shrink-0 rounded-lg border bg-white p-3 overflow-y-auto">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 pb-2 border-b mb-2">
            集团科目层级
          </p>
          <AccountTree
            nodes={tree}
            selectedId={selectedAccount?.id ?? null}
            onSelect={handleSelectAccount}
            expandedIds={expandedIds}
            onToggleExpand={toggleExpand}
          />
        </div>

        {/* Right: Detail */}
        <div className="flex-1 rounded-lg border bg-white overflow-hidden">
          {selectedAccount ? (
            <div className="h-full flex flex-col">
              {/* Account info header */}
              <div className="px-6 py-4 border-b bg-muted/30">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm text-muted-foreground">{selectedAccount.code}</span>
                      <h2 className="text-lg font-semibold">{selectedAccount.name}</h2>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
                      <Badge variant="outline" className={cn("text-xs", ACCOUNT_TYPE_COLORS[selectedAccount.accountType])}>
                        {ACCOUNT_TYPE_LABELS[selectedAccount.accountType]}
                      </Badge>
                      <span>{NORMAL_BALANCE_LABELS[selectedAccount.normalBalance]}余额</span>
                      <span>第 {selectedAccount.level} 级</span>
                      {!selectedAccount.isLeaf && (
                        <Badge variant="secondary" className="text-xs">非末级</Badge>
                      )}
                    </div>
                    {selectedAccount.description && (
                      <p className="text-xs text-muted-foreground mt-1">{selectedAccount.description}</p>
                    )}
                  </div>
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDeleteAccount(selectedAccount)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>

              {/* Mappings section */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">
                    公司科目映射
                    {mappings.length > 0 && (
                      <span className="ml-1.5 text-muted-foreground font-normal">({mappings.length} 条)</span>
                    )}
                  </h3>
                  {canEdit && (
                    <Button size="sm" variant="outline" onClick={() => setNewMappingOpen(true)}>
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      添加映射
                    </Button>
                  )}
                </div>

                {loadingMappings ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">加载中...</div>
                ) : mappings.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground border rounded-lg bg-muted/10">
                    <p className="text-sm">暂无映射</p>
                    <p className="text-xs mt-1">添加映射后，合并报表可自动按集团科目汇总</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>公司</TableHead>
                          <TableHead className="w-24">映射类型</TableHead>
                          <TableHead>本地科目</TableHead>
                          <TableHead className="w-16 text-center">优先级</TableHead>
                          {canEdit && <TableHead className="w-12" />}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {mappings.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium">{m.company.name}</TableCell>
                            <TableCell>
                              <Badge variant={m.mappingType === "DIRECT" ? "default" : "secondary"} className="text-xs">
                                {m.mappingType === "DIRECT" ? "直接" : "范围"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {m.mappingType === "DIRECT"
                                ? m.localCode
                                : `${m.rangeStart} — ${m.rangeEnd}`}
                            </TableCell>
                            <TableCell className="text-center text-sm text-muted-foreground">
                              {m.priority}
                            </TableCell>
                            {canEdit && (
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => handleDeleteMapping(m.id)}
                                >
                                  <X className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Network className="h-12 w-12 mb-3 opacity-20" />
              <p className="text-sm">从左侧选择一个集团科目查看详情</p>
            </div>
          )}
        </div>
      </div>

      {/* ── New Group Account Dialog ──────────────────────────────────────── */}
      <Dialog open={newAccountOpen} onOpenChange={setNewAccountOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>新建集团科目</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>科目编码 *</Label>
                <Input
                  placeholder="1000"
                  value={form.code}
                  onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>科目名称 *</Label>
                <Input
                  placeholder="现金及等价物"
                  value={form.name}
                  onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>科目类型 *</Label>
                <select
                  className="w-full h-10 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                  value={form.accountType}
                  onChange={(e) => {
                    const t = e.target.value as AccountType;
                    setForm((p) => ({
                      ...p,
                      accountType: t,
                      normalBalance: DEFAULT_NORMAL_BALANCE[t],
                      reportCategory: "",
                    }));
                  }}
                >
                  {(Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[]).map((t) => (
                    <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>余额方向</Label>
                <select
                  className="w-full h-10 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                  value={form.normalBalance}
                  onChange={(e) => setForm((p) => ({ ...p, normalBalance: e.target.value as NormalBalance }))}
                >
                  <option value="DEBIT">借方</option>
                  <option value="CREDIT">贷方</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>父科目（可选）</Label>
                <select
                  className="w-full h-10 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                  value={form.parentId}
                  onChange={(e) => setForm((p) => ({ ...p, parentId: e.target.value }))}
                >
                  <option value="">无（顶级科目）</option>
                  {accounts
                    .filter((a) => a.accountType === form.accountType)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} {a.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>报表分类（可选）</Label>
                <select
                  className="w-full h-10 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                  value={form.reportCategory}
                  onChange={(e) => setForm((p) => ({ ...p, reportCategory: e.target.value }))}
                >
                  <option value="">不指定</option>
                  {REPORT_CATEGORIES[form.accountType].map((c) => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isLeaf"
                checked={form.isLeaf}
                onChange={(e) => setForm((p) => ({ ...p, isLeaf: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300 accent-primary"
              />
              <Label htmlFor="isLeaf" className="cursor-pointer font-normal">
                末级科目（可用于映射）
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label>描述（可选）</Label>
              <Input
                placeholder="补充说明"
                value={form.description}
                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewAccountOpen(false)}>取消</Button>
            <Button
              onClick={handleCreateAccount}
              disabled={formPending || !form.code || !form.name}
            >
              {formPending ? "创建中..." : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Mapping Dialog ────────────────────────────────────────────── */}
      <Dialog open={newMappingOpen} onOpenChange={setNewMappingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              添加映射 — {selectedAccount?.code} {selectedAccount?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>公司 *</Label>
              <select
                className="w-full h-10 rounded-md border border-input px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring bg-background"
                value={mappingForm.companyId}
                onChange={(e) => setMappingForm((p) => ({ ...p, companyId: e.target.value }))}
              >
                <option value="">选择公司</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>映射类型</Label>
              <div className="flex gap-3">
                {(["DIRECT", "RANGE"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="mappingType"
                      value={t}
                      checked={mappingForm.mappingType === t}
                      onChange={() => setMappingForm((p) => ({ ...p, mappingType: t }))}
                      className="accent-primary"
                    />
                    <span className="text-sm">{t === "DIRECT" ? "直接映射（精确科目代码）" : "范围映射（编号区间）"}</span>
                  </label>
                ))}
              </div>
            </div>

            {mappingForm.mappingType === "DIRECT" ? (
              <div className="space-y-1.5">
                <Label>本地科目代码 *</Label>
                <Input
                  placeholder="1001"
                  value={mappingForm.localCode}
                  onChange={(e) => setMappingForm((p) => ({ ...p, localCode: e.target.value }))}
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>起始编号 *（含）</Label>
                  <Input
                    placeholder="1001"
                    value={mappingForm.rangeStart}
                    onChange={(e) => setMappingForm((p) => ({ ...p, rangeStart: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>结束编号 *（含）</Label>
                  <Input
                    placeholder="1099"
                    value={mappingForm.rangeEnd}
                    onChange={(e) => setMappingForm((p) => ({ ...p, rangeEnd: e.target.value }))}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>优先级（数字越大优先）</Label>
              <Input
                type="number"
                min={0}
                value={mappingForm.priority}
                onChange={(e) => setMappingForm((p) => ({ ...p, priority: parseInt(e.target.value) || 0 }))}
                className="w-24"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewMappingOpen(false)}>取消</Button>
            <Button
              onClick={handleCreateMapping}
              disabled={
                mappingPending ||
                !mappingForm.companyId ||
                (mappingForm.mappingType === "DIRECT" && !mappingForm.localCode) ||
                (mappingForm.mappingType === "RANGE" && (!mappingForm.rangeStart || !mappingForm.rangeEnd))
              }
            >
              {mappingPending ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
