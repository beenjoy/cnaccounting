import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

async function verifyGroupAccess(session: { user?: { id?: string } | null } | null, groupId: string, requireAdmin = false) {
  if (!session?.user?.id) return null;

  const group = await db.consolidationGroup.findUnique({
    where: { id: groupId },
    select: { id: true, organizationId: true, name: true },
  });
  if (!group) return null;

  const member = await db.organizationMember.findFirst({
    where: { organizationId: group.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member) return null;
  if (requireAdmin && !["OWNER", "ADMIN"].includes(member.role)) return null;

  return { group, member };
}

// GET /api/consolidation-groups/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;
  const access = await verifyGroupAccess(session, id);
  if (!access) return NextResponse.json({ error: "未找到或无权限" }, { status: 404 });

  const group = await db.consolidationGroup.findUnique({
    where: { id },
    include: {
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

  return NextResponse.json(group);
}

// PUT /api/consolidation-groups/[id]
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;
  const access = await verifyGroupAccess(session, id, true);
  if (!access) return NextResponse.json({ error: "未找到或无权限" }, { status: 404 });

  const body = await req.json() as {
    name?: string;
    description?: string;
    reportingCurrency?: string;
  };

  const group = await db.consolidationGroup.update({
    where: { id },
    data: {
      ...(body.name ? { name: body.name.trim() } : {}),
      ...(body.description !== undefined ? { description: body.description?.trim() || null } : {}),
      ...(body.reportingCurrency ? { reportingCurrency: body.reportingCurrency } : {}),
    },
  });

  return NextResponse.json(group);
}

// DELETE /api/consolidation-groups/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const { id } = await params;
  const access = await verifyGroupAccess(session, id, true);
  if (!access) return NextResponse.json({ error: "未找到或无权限" }, { status: 404 });

  await db.consolidationGroup.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
