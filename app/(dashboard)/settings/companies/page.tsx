import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function CompaniesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: {
          companies: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!membership) redirect("/onboarding");

  const companies = membership.organization.companies;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">公司管理</h1>
        <p className="text-muted-foreground mt-1">管理组织下的所有公司实体</p>
      </div>

      <div className="grid gap-4">
        {companies.map((company) => (
          <Card key={company.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{company.name}</CardTitle>
                <Badge variant={company.isActive ? "success" : "secondary"}>
                  {company.isActive ? "活跃" : "停用"}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground">公司代码：</span>
                  <span className="font-mono">{company.code}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">记账本位币：</span>
                  <span className="font-mono">{company.functionalCurrency}</span>
                </div>
                {company.legalName && (
                  <div>
                    <span className="text-muted-foreground">法定名称：</span>
                    <span>{company.legalName}</span>
                  </div>
                )}
                {company.taxId && (
                  <div>
                    <span className="text-muted-foreground">税号：</span>
                    <span className="font-mono">{company.taxId}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
