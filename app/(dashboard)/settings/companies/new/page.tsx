import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { CompanyWizard } from "./company-wizard";

export default async function NewCompanyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      role: { in: ["OWNER", "ADMIN"] },
    },
  });

  if (!membership) redirect("/settings/companies");

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">创建新公司</h1>
        <p className="text-muted-foreground mt-1">配置公司基本信息、税务属性和会计科目模板</p>
      </div>

      <CompanyWizard />
    </div>
  );
}
