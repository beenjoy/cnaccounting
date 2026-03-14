import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { GroupActions } from "./group-actions";

export default async function ConsolidationPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const member = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: {
          companies: {
            where: { isActive: true },
            orderBy: { name: "asc" },
            select: { id: true, name: true, code: true },
          },
        },
      },
    },
  });
  if (!member) redirect("/onboarding");

  const { organization } = member;
  const isAdmin = ["OWNER", "ADMIN"].includes(member.role);

  const groups = await db.consolidationGroup.findMany({
    where: { organizationId: organization.id },
    include: {
      members: {
        include: {
          company: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ memberType: "asc" }, { sortOrder: "asc" }],
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const METHOD_LABELS: Record<string, string> = {
    FULL: "全额合并",
    EQUITY: "权益法",
    COST: "成本法",
  };

  return (
    <div className="flex-1 space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">合并报表</h1>
          <p className="text-sm text-muted-foreground mt-1">
            配置合并组，编制集团合并财务报表
          </p>
        </div>
        {isAdmin && (
          <GroupActions
            organizationId={organization.id}
            companies={organization.companies}
            mode="create"
          />
        )}
      </div>

      {groups.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-lg border">
          <div className="text-muted-foreground mb-2">暂无合并组</div>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "点击右上角「新建合并组」，将多家公司纳入合并范围"
              : "管理员尚未创建合并组"}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => {
            const parent = group.members.find((m) => m.memberType === "PARENT");
            const subsidiaries = group.members.filter((m) => m.memberType === "SUBSIDIARY");

            return (
              <div key={group.id} className="bg-white border rounded-lg p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className="font-semibold text-base">{group.name}</h2>
                    {group.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{group.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground border rounded px-1.5 py-0.5">
                    {group.reportingCurrency}
                  </span>
                </div>

                {/* Members summary */}
                <div className="space-y-1 mb-4">
                  {parent && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700">母公司</span>
                      <span className="font-medium">{parent.company.name}</span>
                    </div>
                  )}
                  {subsidiaries.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm">
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600">子公司</span>
                      <span>{m.company.name}</span>
                      <span className="text-xs text-muted-foreground ml-auto">
                        {(Number(m.ownershipPct) * 100).toFixed(0)}% · {METHOD_LABELS[m.consolidationMethod] ?? m.consolidationMethod}
                      </span>
                    </div>
                  ))}
                  {group.members.length === 0 && (
                    <p className="text-xs text-muted-foreground italic">尚未添加成员公司</p>
                  )}
                </div>

                {/* Action links */}
                <div className="flex items-center gap-2 pt-3 border-t">
                  <Link href={`/consolidation/${group.id}`}
                    className="text-xs text-primary hover:underline">
                    管理成员
                  </Link>
                  <span className="text-muted-foreground">·</span>
                  <Link href={`/consolidation/${group.id}/trial-balance`}
                    className="text-xs text-primary hover:underline">
                    试算表
                  </Link>
                  <span className="text-muted-foreground">·</span>
                  <Link href={`/consolidation/${group.id}/balance-sheet`}
                    className="text-xs text-primary hover:underline">
                    资产负债表
                  </Link>
                  <span className="text-muted-foreground">·</span>
                  <Link href={`/consolidation/${group.id}/income-statement`}
                    className="text-xs text-primary hover:underline">
                    利润表
                  </Link>
                  {isAdmin && (
                    <>
                      <span className="text-muted-foreground ml-auto">·</span>
                      <GroupActions
                        organizationId={organization.id}
                        companies={organization.companies}
                        mode="delete"
                        groupId={group.id}
                        groupName={group.name}
                      />
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
