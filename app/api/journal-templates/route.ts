import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// GET /api/journal-templates?companyId=xxx
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const companyId = searchParams.get("companyId");

  if (!companyId) return NextResponse.json({ error: "companyId required" }, { status: 400 });

  // Verify user has access to this company
  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organization: { companies: { some: { id: companyId } } },
    },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const templates = await db.journalTemplate.findMany({
    where: { companyId, isActive: true },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json({ templates });
}

// POST /api/journal-templates  — create custom template
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { companyId, name, description, category, lines } = body;

  if (!companyId || !name || !Array.isArray(lines) || lines.length < 2) {
    return NextResponse.json({ error: "companyId, name, and at least 2 lines are required" }, { status: 400 });
  }

  // Verify access
  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organization: { companies: { some: { id: companyId } } },
    },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const template = await db.journalTemplate.create({
    data: {
      companyId,
      name: name.trim(),
      description: description?.trim() || null,
      category: category?.trim() || null,
      isSystem: false,
      lines: {
        create: lines.map((l: { accountCode?: string; accountName?: string; direction: string; description?: string }, i: number) => ({
          lineNumber: i + 1,
          accountCode: l.accountCode?.trim() || null,
          accountName: l.accountName?.trim() || null,
          direction: l.direction,
          description: l.description?.trim() || null,
        })),
      },
    },
    include: { lines: { orderBy: { lineNumber: "asc" } } },
  });

  return NextResponse.json({ template }, { status: 201 });
}
