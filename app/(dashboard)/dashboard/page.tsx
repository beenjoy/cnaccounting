import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, FileText, TrendingUp, Calendar } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: true } } },
  });

  if (!membership) redirect("/onboarding");

  const company = membership.organization.companies[0];
  if (!company) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-muted-foreground mb-4">还没有创建公司，请先创建公司</p>
        <Link
          href="/settings/companies"
          className="text-blue-600 hover:underline"
        >
          创建公司
        </Link>
      </div>
    );
  }

  // 获取统计数据
  const [accountsCount, journalsCount, openPeriodsCount] = await Promise.all([
    db.chartOfAccount.count({ where: { companyId: company.id } }),
    db.journalEntry.count({ where: { companyId: company.id } }),
    db.fiscalPeriod.count({
      where: {
        fiscalYear: { companyId: company.id },
        status: "OPEN",
      },
    }),
  ]);

  const recentJournals = await db.journalEntry.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { createdBy: true },
  });

  const statusLabel: Record<string, string> = {
    DRAFT: "草稿",
    PENDING_APPROVAL: "待审批",
    APPROVED: "已审批",
    POSTED: "已过账",
    REVERSED: "已冲销",
  };

  const statusColor: Record<string, string> = {
    DRAFT: "text-gray-500",
    PENDING_APPROVAL: "text-yellow-600",
    APPROVED: "text-blue-600",
    POSTED: "text-green-600",
    REVERSED: "text-red-500",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">仪表盘</h1>
        <p className="text-muted-foreground mt-1">{company.name}</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              会计科目数
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{accountsCount}</div>
            <Link
              href="/accounts"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
            >
              查看科目表
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              凭证总数
            </CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{journalsCount}</div>
            <Link
              href="/journals"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
            >
              查看凭证
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              开放期间数
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openPeriodsCount}</div>
            <Link
              href="/periods"
              className="text-xs text-blue-600 hover:underline mt-1 inline-block"
            >
              管理期间
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* 最近凭证 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">最近凭证</CardTitle>
        </CardHeader>
        <CardContent>
          {recentJournals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              暂无凭证，
              <Link href="/journals/new" className="text-blue-600 hover:underline">
                立即创建
              </Link>
            </p>
          ) : (
            <div className="space-y-2">
              {recentJournals.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <Link
                      href={`/journals/${entry.id}`}
                      className="font-medium text-sm hover:text-blue-600"
                    >
                      {entry.entryNumber}
                    </Link>
                    <p className="text-xs text-muted-foreground">{entry.description}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs font-medium ${statusColor[entry.status]}`}>
                      {statusLabel[entry.status]}
                    </span>
                    <p className="text-xs text-muted-foreground">{formatDate(entry.entryDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
