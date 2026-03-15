import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// DELETE /api/journal-templates/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const template = await db.journalTemplate.findUnique({ where: { id } });
  if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Verify access to company
  const membership = await db.organizationMember.findFirst({
    where: {
      userId: session.user.id,
      organization: { companies: { some: { id: template.companyId } } },
    },
  });
  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (template.isSystem) {
    return NextResponse.json({ error: "系统内置模板不可删除" }, { status: 403 });
  }

  await db.journalTemplate.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
