import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { PeriodsClient } from "./periods-client";

export default async function PeriodsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  const fiscalYears = await db.fiscalYear.findMany({
    where: { companyId: company.id },
    include: { periods: { orderBy: { periodNumber: "asc" } } },
    orderBy: { year: "desc" },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">会计期间管理</h1>
        <p className="text-muted-foreground mt-1">管理会计年度和月度期间的开放/关闭状态</p>
      </div>
      <PeriodsClient companyId={company.id} fiscalYears={fiscalYears} />
    </div>
  );
}
