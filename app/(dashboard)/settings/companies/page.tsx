import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

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
  const canCreate = membership.role === "OWNER" || membership.role === "ADMIN";

  const industryLabel: Record<string, string> = {
    GENERAL: "通用", MANUFACTURING: "制造业", SERVICE: "服务业",
    TRADE: "商贸零售", CONSTRUCTION: "建筑业", FINANCE: "金融业",
  };
  const vatLabel: Record<string, string> = {
    GENERAL_TAXPAYER: "一般纳税人", SMALL_SCALE: "小规模纳税人", EXEMPT: "免税",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">公司管理</h1>
          <p className="text-muted-foreground mt-1">管理组织下的所有公司实体</p>
        </div>
        {canCreate && (
          <Button asChild>
            <Link href="/settings/companies/new">
              <Plus className="mr-2 h-4 w-4" />
              新建公司
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4">
        {companies.map((company) => (
          <Card key={company.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">{company.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{industryLabel[company.industryType] ?? company.industryType}</Badge>
                  <Badge variant={company.isActive ? "success" : "secondary"}>
                    {company.isActive ? "活跃" : "停用"}
                  </Badge>
                </div>
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
                <div>
                  <span className="text-muted-foreground">增值税类型：</span>
                  <span>{vatLabel[company.vatType] ?? company.vatType}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">所得税率：</span>
                  <span>{(Number(company.incomeTaxRate) * 100).toFixed(0)}%</span>
                </div>
                {company.legalName && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">法定名称：</span>
                    <span>{company.legalName}</span>
                  </div>
                )}
                {company.taxId && (
                  <div className="col-span-2">
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
