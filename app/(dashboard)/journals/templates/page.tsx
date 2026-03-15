import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { TemplateManager } from "./template-manager";

export default async function JournalTemplatesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  const templates = await db.journalTemplate.findMany({
    where: { companyId: company.id, isActive: true },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  // Group by category
  const byCategory = new Map<string, typeof templates>();
  for (const tpl of templates) {
    const cat = tpl.category ?? "其他";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(tpl);
  }

  const systemCount   = templates.filter((t) => t.isSystem).length;
  const customCount   = templates.filter((t) => !t.isSystem).length;
  const hasSystemSeed = systemCount > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">凭证模板</h1>
          <p className="text-muted-foreground mt-1">
            预定义标准分录，新建凭证时一键套用 · 共 {templates.length} 个模板（系统 {systemCount}，自定义 {customCount}）
          </p>
        </div>
        <TemplateManager
          companyId={company.id}
          hasSystemSeed={hasSystemSeed}
          mode="header-actions"
        />
      </div>

      {templates.length === 0 ? (
        <div className="rounded-lg border border-dashed p-16 text-center space-y-3">
          <p className="text-muted-foreground">尚未创建任何凭证模板</p>
          <TemplateManager
            companyId={company.id}
            hasSystemSeed={false}
            mode="empty-state"
          />
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(byCategory.entries()).map(([category, tpls]) => (
            <div key={category}>
              <h2 className="text-base font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                {category}
                <span className="text-xs font-normal">（{tpls.length}）</span>
                <span className="h-px flex-1 bg-border" />
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {tpls.map((tpl) => (
                  <div
                    key={tpl.id}
                    className="rounded-lg border bg-white p-4 space-y-3 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-sm">{tpl.name}</p>
                        {tpl.description && (
                          <p className="text-xs text-muted-foreground mt-0.5">{tpl.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {tpl.isSystem && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">系统</span>
                        )}
                        {!tpl.isSystem && (
                          <TemplateManager
                            companyId={company.id}
                            hasSystemSeed={hasSystemSeed}
                            mode="delete"
                            templateId={tpl.id}
                            templateName={tpl.name}
                          />
                        )}
                      </div>
                    </div>

                    {/* Lines preview */}
                    <div className="rounded border bg-muted/20 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b bg-muted/40">
                            <th className="px-2 py-1 text-left text-muted-foreground font-medium">科目</th>
                            <th className="px-2 py-1 text-center text-muted-foreground font-medium w-12">借/贷</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {tpl.lines.map((line) => (
                            <tr key={line.id}>
                              <td className="px-2 py-1">
                                <span className="font-mono text-muted-foreground mr-1">{line.accountCode}</span>
                                {line.accountName}
                              </td>
                              <td className={`px-2 py-1 text-center font-medium ${line.direction === "DEBIT" ? "text-blue-600" : "text-red-500"}`}>
                                {line.direction === "DEBIT" ? "借" : "贷"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
