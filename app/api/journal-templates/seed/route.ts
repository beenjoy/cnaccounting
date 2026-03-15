import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { BUILT_IN_TEMPLATES } from "@/lib/journal-template-seeds";

// POST /api/journal-templates/seed?companyId=xxx
// Seeds the built-in templates for a company (idempotent — skips existing system templates)
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  // Verify access
  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organization: { companies: { some: { id: companyId } } },
    },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Check how many system templates already exist
  const existing = await db.journalTemplate.count({
    where: { companyId, isSystem: true },
  });

  if (existing >= BUILT_IN_TEMPLATES.length) {
    return NextResponse.json({ message: "内置模板已是最新，无需重新导入", created: 0 });
  }

  // Get names of already-seeded system templates
  const existingNames = await db.journalTemplate.findMany({
    where: { companyId, isSystem: true },
    select: { name: true },
  }).then((rows) => new Set(rows.map((r) => r.name)));

  let created = 0;
  for (const tpl of BUILT_IN_TEMPLATES) {
    if (existingNames.has(tpl.name)) continue;
    await db.journalTemplate.create({
      data: {
        companyId,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        isSystem: true,
        sortOrder: tpl.sortOrder,
        lines: {
          create: tpl.lines.map((l) => ({
            lineNumber: l.lineNumber,
            accountCode: l.accountCode,
            accountName: l.accountName,
            direction: l.direction,
            description: l.description,
          })),
        },
      },
    });
    created++;
  }

  return NextResponse.json({ message: `已导入 ${created} 个内置模板`, created });
}
