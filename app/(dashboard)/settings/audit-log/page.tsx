import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

const ACTION_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning" | "info" }> = {
  CREATE:       { label: "创建",     variant: "info" },
  UPDATE:       { label: "更新",     variant: "secondary" },
  DELETE:       { label: "删除",     variant: "destructive" },
  POST:         { label: "过账",     variant: "success" },
  REVERSE:      { label: "冲销",     variant: "warning" },
  APPROVE:      { label: "审批",     variant: "success" },
  REJECT:       { label: "退回",     variant: "destructive" },
  OPEN_PERIOD:  { label: "重开期间", variant: "warning" },
  CLOSE_PERIOD: { label: "关闭期间", variant: "secondary" },
};

const ENTITY_LABELS: Record<string, string> = {
  JournalEntry: "日记账凭证",
  FiscalPeriod: "会计期间",
  Company:      "公司",
  Account:      "会计科目",
};

function formatDateTime(d: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).format(d).replace(/\//g, "-");
}

interface Props {
  searchParams: Promise<{ page?: string; action?: string }>;
}

export default async function AuditLogPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1", 10));
  const actionFilter = sp.action ?? "";

  // 获取成员信息
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: { companies: { select: { id: true } } },
      },
    },
  });

  if (!membership) redirect("/onboarding");

  // 只有 OWNER / ADMIN 可查看
  if (!["OWNER", "ADMIN"].includes(membership.role)) {
    redirect("/dashboard");
  }

  const companyIds = membership.organization.companies.map((c) => c.id);

  type ValidAction = "CREATE" | "UPDATE" | "DELETE" | "POST" | "REVERSE" | "APPROVE" | "REJECT" | "OPEN_PERIOD" | "CLOSE_PERIOD";
  const VALID_ACTIONS = new Set<string>(["CREATE", "UPDATE", "DELETE", "POST", "REVERSE", "APPROVE", "REJECT", "OPEN_PERIOD", "CLOSE_PERIOD"]);
  const validAction = VALID_ACTIONS.has(actionFilter) ? (actionFilter as ValidAction) : undefined;

  const baseWhere = { companyId: { in: companyIds }, ...(validAction ? { action: validAction } : {}) };

  const [total, logs] = await Promise.all([
    db.auditLog.count({ where: baseWhere }),
    db.auditLog.findMany({
      where: baseWhere,
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  // Build URL helper
  function buildUrl(p: number, a?: string) {
    const params = new URLSearchParams();
    if (p > 1) params.set("page", String(p));
    if (a) params.set("action", a);
    const q = params.toString();
    return `/settings/audit-log${q ? `?${q}` : ""}`;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">审计日志</h1>
        <p className="text-muted-foreground mt-1">记录系统中所有关键操作，共 {total} 条</p>
      </div>

      {/* 筛选 */}
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">按操作类型筛选：</span>
        <form method="GET" action="/settings/audit-log" className="flex items-center gap-2">
          <select
            name="action"
            defaultValue={actionFilter}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          >
            <option value="">全部操作</option>
            {Object.entries(ACTION_LABELS).map(([val, { label }]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <button type="submit" className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted">
            筛选
          </button>
          {actionFilter && (
            <Link href="/settings/audit-log" className="text-sm text-muted-foreground hover:underline">
              清除
            </Link>
          )}
        </form>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">操作记录</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">暂无审计记录</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground whitespace-nowrap">时间</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">操作人</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">动作</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">实体类型</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">描述</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">详情</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logs.map((log) => {
                    const action = ACTION_LABELS[log.action] ?? { label: log.action, variant: "secondary" as const };
                    const entityLabel = ENTITY_LABELS[log.entityType] ?? log.entityType;
                    const hasJson = log.oldValues || log.newValues;
                    return (
                      <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground whitespace-nowrap">
                          {formatDateTime(log.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{log.user.name ?? log.user.email}</div>
                          {log.user.name && (
                            <div className="text-xs text-muted-foreground">{log.user.email}</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={action.variant}>{action.label}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{entityLabel}</td>
                        <td className="px-4 py-3 max-w-xs truncate" title={log.description}>
                          {log.description}
                        </td>
                        <td className="px-4 py-3">
                          {hasJson && (
                            <details className="cursor-pointer">
                              <summary className="text-xs text-primary hover:underline select-none">
                                展开
                              </summary>
                              <pre className="mt-2 max-w-xs overflow-auto rounded bg-muted p-2 text-xs leading-relaxed whitespace-pre-wrap">
                                {JSON.stringify({ old: log.oldValues, new: log.newValues }, null, 2)}
                              </pre>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {page} / {totalPages} 页，共 {total} 条
          </span>
          <div className="flex items-center gap-2">
            {page > 1 && (
              <Link
                href={buildUrl(page - 1, actionFilter)}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-muted transition-colors"
              >
                <ChevronLeft className="h-4 w-4" /> 上一页
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={buildUrl(page + 1, actionFilter)}
                className="flex items-center gap-1 rounded-md border px-3 py-1.5 hover:bg-muted transition-colors"
              >
                下一页 <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
