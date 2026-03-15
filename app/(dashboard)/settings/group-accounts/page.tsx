import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { GroupAccountsClient } from "./group-accounts-client";

export default async function GroupAccountsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  if (!membership) redirect("/onboarding");

  const [accounts, companies] = await Promise.all([
    db.groupAccount.findMany({
      where: { organizationId: membership.organizationId },
      orderBy: { code: "asc" },
      include: {
        _count: { select: { children: true, mappings: true } },
      },
    }),
    db.company.findMany({
      where: { organizationId: membership.organizationId, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const canEdit = ["OWNER", "ADMIN"].includes(membership.role);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">集团科目表</h1>
        <p className="text-muted-foreground mt-1">
          定义集团统一科目体系，为各公司科目建立映射关系，支持合并报表自动汇总
        </p>
      </div>
      <GroupAccountsClient
        initialAccounts={accounts.map((a) => ({
          ...a,
          reportCategory: a.reportCategory ?? null,
          description: a.description ?? null,
          childCount: a._count.children,
          mappingCount: a._count.mappings,
        }))}
        companies={companies}
        canEdit={canEdit}
      />
    </div>
  );
}
