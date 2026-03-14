import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Lock } from "lucide-react";
import { YearEndCloseButton } from "./year-end-client";

export default async function YearEndPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  // 只有 OWNER/ADMIN 可操作年末结账
  const canClose = ["OWNER", "ADMIN"].includes(membership?.role ?? "");

  // 获取当前（或最近）会计年度及其12期
  const now = new Date();
  const fiscalYear = await db.fiscalYear.findFirst({
    where: { companyId: company.id, year: now.getFullYear() },
    include: {
      periods: { orderBy: { periodNumber: "asc" } },
    },
  });

  if (!fiscalYear) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">年末结账</h1>
          <p className="text-muted-foreground mt-1">自动生成损益结转凭证，关闭会计年度</p>
        </div>
        <p className="text-muted-foreground">未找到当前会计年度的数据。</p>
      </div>
    );
  }

  const allClosed = fiscalYear.periods.every((p) => p.status === "CLOSED");
  const openPeriods = fiscalYear.periods.filter((p) => p.status === "OPEN");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">年末结账</h1>
        <p className="text-muted-foreground mt-1">
          {fiscalYear.year} 年度 — 自动生成损益结转凭证并关闭会计年度
        </p>
      </div>

      {/* 年度状态 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{fiscalYear.year} 年度状态</CardTitle>
            {fiscalYear.isClosed ? (
              <Badge variant="secondary" className="gap-1">
                <Lock className="h-3 w-3" />
                已关闭
              </Badge>
            ) : (
              <Badge variant="outline">进行中</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {fiscalYear.periods.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs ${
                  p.status === "CLOSED"
                    ? "border-green-200 bg-green-50 text-green-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
                }`}
              >
                {p.status === "CLOSED" ? (
                  <CheckCircle2 className="h-3 w-3 shrink-0" />
                ) : (
                  <XCircle className="h-3 w-3 shrink-0" />
                )}
                <span>{p.periodNumber}月</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 操作区 */}
      {fiscalYear.isClosed ? (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Lock className="h-5 w-5" />
              <div>
                <p className="font-medium text-foreground">{fiscalYear.year} 年度已完成年末结账</p>
                {fiscalYear.closedAt && (
                  <p className="text-sm mt-0.5">
                    关闭时间：{new Date(fiscalYear.closedAt).toLocaleString("zh-CN")}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ) : !allClosed ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-700">尚有未关闭的会计期间</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              执行年末结账前，必须先关闭以下 {openPeriods.length} 个期间：
            </p>
            <div className="space-y-1">
              {openPeriods.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <XCircle className="h-4 w-4 text-amber-500" />
                  <span>{p.name}</span>
                </div>
              ))}
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              请前往{" "}
              <a href="/periods" className="text-primary hover:underline">
                会计期间
              </a>{" "}
              页面关闭上述期间后再返回此页。
            </p>
          </CardContent>
        </Card>
      ) : canClose ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">✅ 所有期间已关闭，可执行年末结账</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-2">
              <p className="font-medium">年末结账将自动执行以下操作：</p>
              <ol className="list-decimal list-inside space-y-1 text-muted-foreground">
                <li>汇总全年所有已过账收入/费用科目余额</li>
                <li>生成<strong>损益结转凭证</strong>：将收入/费用科目归零，净额记入「本年利润」</li>
                <li>如净利润 &gt; 0，生成<strong>盈余公积计提凭证</strong>（净利润 × 10%）</li>
                <li>将 {fiscalYear.year} 年度标记为「已关闭」，不可再录入或修改凭证</li>
              </ol>
            </div>
            <YearEndCloseButton
              fiscalYearId={fiscalYear.id}
              yearLabel={`${fiscalYear.year}年度`}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-sm">
              所有期间已关闭。请联系组织所有者（OWNER）或管理员（ADMIN）执行年末结账。
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
