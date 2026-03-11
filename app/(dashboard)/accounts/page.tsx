import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { AccountsClient } from "./accounts-client";

async function getCompanyId(userId: string): Promise<string | null> {
  const membership = await db.organizationMember.findFirst({
    where: { userId },
    include: {
      organization: {
        include: { companies: { where: { isActive: true }, take: 1 } },
      },
    },
  });
  return membership?.organization.companies[0]?.id ?? null;
}

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const companyId = await getCompanyId(session.user.id);
  if (!companyId) redirect("/settings/companies");

  const accounts = await db.chartOfAccount.findMany({
    where: { companyId },
    orderBy: [{ code: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">科目表</h1>
          <p className="text-muted-foreground mt-1">管理会计科目层级结构</p>
        </div>
      </div>
      <AccountsClient companyId={companyId} initialAccounts={accounts} />
    </div>
  );
}
