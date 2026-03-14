import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  ALL_RESOURCES,
  ALL_ACTIONS,
  getDefaultActionsForRole,
  CONFIGURABLE_ROLES,
} from "@/lib/permissions";
import type { PolicyResource, PolicyAction, MemberRole } from "@prisma/client";

// ── GET /api/role-policies ──────────────────────────────────────────────────
// 返回当前组织各可配置角色在所有资源上的权限（DB自定义 + 默认回退）
export async function GET(_req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "未找到成员信息" }, { status: 404 });
  }

  // 只有 OWNER 可查看/管理权限矩阵
  if (membership.role !== "OWNER") {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const orgId = membership.organizationId;

  // 查询该组织所有自定义策略（companyScope = null 的全局策略）
  const customPolicies = await db.rolePolicy.findMany({
    where: { organizationId: orgId, companyScope: null },
    select: { role: true, resource: true, actions: true },
  });

  // 构建 Map<`${role}:${resource}`, PolicyAction[]>
  const customMap = new Map<string, PolicyAction[]>();
  for (const p of customPolicies) {
    customMap.set(`${p.role}:${p.resource}`, p.actions);
  }

  // 生成完整矩阵（所有可配置角色 × 所有资源）
  // 若有自定义策略则用自定义，否则用系统默认，并标记来源
  type PolicyRow = {
    role: MemberRole;
    resource: PolicyResource;
    actions: PolicyAction[];
    isCustom: boolean;
  };

  const matrix: PolicyRow[] = [];
  for (const role of CONFIGURABLE_ROLES) {
    for (const resource of ALL_RESOURCES) {
      const key = `${role}:${resource}`;
      const custom = customMap.get(key);
      if (custom !== undefined) {
        matrix.push({ role, resource, actions: custom, isCustom: true });
      } else {
        matrix.push({
          role,
          resource,
          actions: getDefaultActionsForRole(role, resource),
          isCustom: false,
        });
      }
    }
  }

  return NextResponse.json({ matrix, allResources: ALL_RESOURCES, allActions: ALL_ACTIONS });
}

// ── PUT /api/role-policies ──────────────────────────────────────────────────
// 批量更新某角色在某资源上的自定义权限策略
// Body: { role: MemberRole, resource: PolicyResource, actions: PolicyAction[] }
export async function PUT(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "未找到成员信息" }, { status: 404 });
  }

  if (membership.role !== "OWNER") {
    return NextResponse.json({ error: "只有所有者可修改权限策略" }, { status: 403 });
  }

  const body = await req.json() as {
    role: MemberRole;
    resource: PolicyResource;
    actions: PolicyAction[];
  };

  const { role, resource, actions } = body;

  // 校验枚举值
  const validRoles = new Set<string>(["ADMIN", "ACCOUNTANT", "AUDITOR", "PERIOD_MANAGER"]);
  const validResources = new Set<string>(ALL_RESOURCES);
  const validActions = new Set<string>(ALL_ACTIONS);

  if (!validRoles.has(role)) {
    return NextResponse.json({ error: "无效的角色" }, { status: 400 });
  }
  if (!validResources.has(resource)) {
    return NextResponse.json({ error: "无效的资源" }, { status: 400 });
  }
  for (const a of actions) {
    if (!validActions.has(a)) {
      return NextResponse.json({ error: `无效的动作: ${a}` }, { status: 400 });
    }
  }

  const orgId = membership.organizationId;

  // Prisma upsert 不支持 nullable unique 字段的 where，改用 findFirst + create/update
  const existing = await db.rolePolicy.findFirst({
    where: { organizationId: orgId, role, resource, companyScope: null },
    select: { id: true },
  });

  if (existing) {
    await db.rolePolicy.update({ where: { id: existing.id }, data: { actions } });
  } else {
    await db.rolePolicy.create({
      data: { organizationId: orgId, role, resource, actions, companyScope: null },
    });
  }

  // 写审计日志（需要 companyId，取组织下第一个公司）
  const company = await db.company.findFirst({
    where: { organizationId: orgId },
    select: { id: true },
  });
  if (company) {
    await db.auditLog.create({
      data: {
        companyId: company.id,
        userId: session.user.id,
        action: "UPDATE",
        entityType: "RolePolicy",
        entityId: `${orgId}:${role}:${resource}`,
        description: `更新权限策略：${role} → ${resource}，授权动作：[${actions.join(", ")}]`,
      },
    });
  }

  return NextResponse.json({ success: true });
}

// ── DELETE /api/role-policies ───────────────────────────────────────────────
// 重置某角色在某资源上的策略为系统默认（删除自定义记录）
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  if (!membership || membership.role !== "OWNER") {
    return NextResponse.json({ error: "无权操作" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role") as MemberRole | null;
  const resource = searchParams.get("resource") as PolicyResource | null;

  if (!role || !resource) {
    return NextResponse.json({ error: "缺少 role 或 resource 参数" }, { status: 400 });
  }

  await db.rolePolicy.deleteMany({
    where: {
      organizationId: membership.organizationId,
      role,
      resource,
      companyScope: null,
    },
  });

  return NextResponse.json({ success: true });
}
