import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import {
  ALL_RESOURCES,
  ALL_ACTIONS,
  getDefaultActionsForRole,
  CONFIGURABLE_ROLES,
} from "@/lib/permissions";
import type { PolicyResource, PolicyAction, MemberRole } from "@prisma/client";
import { PermissionMatrix } from "./permission-matrix";

type PolicyRow = {
  role: MemberRole;
  resource: PolicyResource;
  actions: PolicyAction[];
  isCustom: boolean;
};

export default async function PermissionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });

  if (!membership) redirect("/onboarding");

  // 只有 OWNER 可访问
  if (membership.role !== "OWNER") redirect("/dashboard");

  const orgId = membership.organizationId;

  // 查询该组织所有全局自定义策略
  const customPolicies = await db.rolePolicy.findMany({
    where: { organizationId: orgId, companyScope: null },
    select: { role: true, resource: true, actions: true },
  });

  const customMap = new Map<string, PolicyAction[]>();
  for (const p of customPolicies) {
    customMap.set(`${p.role}:${p.resource}`, p.actions);
  }

  // 构建完整矩阵
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">权限管理</h1>
        <p className="text-muted-foreground mt-1">
          为各角色配置资源操作权限。仅所有者（OWNER）可修改。
        </p>
      </div>

      <PermissionMatrix
        initialMatrix={matrix}
        allResources={ALL_RESOURCES}
        allActions={ALL_ACTIONS}
      />
    </div>
  );
}
