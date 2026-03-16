import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { MemberActions } from "./member-actions";

const METHOD_LABELS: Record<string, string> = {
  FULL: "全额合并",
  EQUITY: "权益法",
  COST: "成本法",
};

const TYPE_LABELS: Record<string, { label: string; cls: string }> = {
  PARENT: { label: "母公司", cls: "bg-blue-100 text-blue-700" },
  SUBSIDIARY: { label: "子公司", cls: "bg-gray-100 text-gray-600" },
};

export default async function ConsolidationGroupPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const group = await db.consolidationGroup.findUnique({
    where: { id },
    include: {
      organization: { select: { id: true } },
      members: {
        include: {
          company: {
            select: { id: true, name: true, code: true, isActive: true, functionalCurrency: true },
          },
        },
        orderBy: [{ memberType: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  if (!group) notFound();

  // Verify membership
  const orgMember = await db.organizationMember.findFirst({
    where: { organizationId: group.organization.id, userId: session.user.id },
    select: { role: true },
  });
  if (!orgMember) redirect("/dashboard");

  const isAdmin = ["OWNER", "ADMIN"].includes(orgMember.role);

  // Available companies (not yet in this group)
  const allCompanies = await db.company.findMany({
    where: { organizationId: group.organization.id, isActive: true },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });
  const memberCompanyIds = new Set(group.members.map((m) => m.companyId));
  const availableCompanies = allCompanies.filter((c) => !memberCompanyIds.has(c.id));

  const hasParent = group.members.some((m) => m.memberType === "PARENT");

  return (
    <div className="flex-1 space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/consolidation" className="text-sm text-muted-foreground hover:text-foreground">
              合并报表
            </Link>
            <span className="text-muted-foreground">/</span>
            <span className="text-sm font-medium">{group.name}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{group.name}</h1>
          {group.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{group.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/consolidation/${id}/trial-balance`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            合并试算表
          </Link>
          <Link href={`/consolidation/${id}/balance-sheet`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            合并资产负债表
          </Link>
          <Link href={`/consolidation/${id}/income-statement`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            合并利润表
          </Link>
          <Link href={`/consolidation/${id}/cash-flow`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            合并现金流量表
          </Link>
          <Link href={`/consolidation/${id}/equity-statement`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            权益变动表
          </Link>
          <Link href={`/consolidation/${id}/intercompany`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            内部交易核对
          </Link>
          <Link href={`/consolidation/${id}/group-mapping`}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted">
            集团科目对照
          </Link>
        </div>
      </div>

      {/* Members table */}
      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30 flex items-center justify-between">
          <h2 className="text-sm font-semibold">成员公司（{group.members.length}家）</h2>
          {isAdmin && availableCompanies.length > 0 && (
            <MemberActions
              groupId={id}
              availableCompanies={availableCompanies}
              hasParent={hasParent}
              mode="add"
            />
          )}
        </div>

        {group.members.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            暂未添加成员公司。添加母公司和子公司后，可编制合并财务报表。
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/20 border-b">
              <tr>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">公司</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">类型</th>
                <th className="px-4 py-2 text-right font-medium text-muted-foreground">持股比例</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">合并方法</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">长期股权投资科目</th>
                <th className="px-4 py-2 text-left font-medium text-muted-foreground">货币</th>
                {isAdmin && <th className="px-4 py-2 text-right font-medium text-muted-foreground">操作</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {group.members.map((m) => {
                const typeInfo = TYPE_LABELS[m.memberType] ?? { label: m.memberType, cls: "bg-gray-100 text-gray-600" };
                return (
                  <tr key={m.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2">
                      <div className="font-medium">{m.company.name}</div>
                      <div className="text-xs text-muted-foreground">{m.company.code}</div>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeInfo.cls}`}>
                        {typeInfo.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      {m.memberType === "PARENT" ? "—" : `${(Number(m.ownershipPct) * 100).toFixed(1)}%`}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {m.memberType === "PARENT" ? "—" : (METHOD_LABELS[m.consolidationMethod] ?? m.consolidationMethod)}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {m.investmentAccountCode || "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {m.company.functionalCurrency}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2 text-right">
                        <MemberActions
                          groupId={id}
                          memberId={m.id}
                          memberType={m.memberType}
                          ownershipPct={Number(m.ownershipPct)}
                          consolidationMethod={m.consolidationMethod}
                          investmentAccountCode={m.investmentAccountCode ?? ""}
                          availableCompanies={availableCompanies}
                          hasParent={hasParent}
                          mode="remove"
                        />
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Info panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
        <p className="font-medium mb-1">合并范围说明</p>
        <ul className="space-y-1 text-xs text-blue-700 list-disc list-inside">
          <li><strong>全额合并</strong>：适用于控股子公司（持股比例通常 &gt; 50%），将子公司资产、负债及损益100%纳入合并报表</li>
          <li><strong>权益法</strong>：适用于联营企业（持股20%–50%），按持股比例确认投资收益</li>
          <li><strong>成本法</strong>：适用于小比例投资（持股 &lt; 20%），仅在收到股利时确认收益</li>
        </ul>
      </div>
    </div>
  );
}
