/**
 * 细粒度权限检查（Phase 2）
 *
 * 双层 RBAC：
 *   1. 系统预置硬编码策略（不可删除、不可修改）
 *   2. 组织自定义 RolePolicy 记录（可通过权限矩阵 UI 配置）
 *
 * 检查顺序：
 *   - OWNER 拥有全部权限（永远返回 true）
 *   - 先查数据库自定义策略；若无记录，回退系统默认策略
 */

import { db } from "@/lib/db";
import type { PolicyResource, PolicyAction, MemberRole } from "@prisma/client";

export type { PolicyResource, PolicyAction };

// ── 系统默认权限矩阵（回退策略） ──────────────────────────────────────
// key: `${role}:${resource}`, value: Set<PolicyAction>
const DEFAULT_POLICIES: Record<string, Set<PolicyAction>> = buildDefaults();

function a(...actions: PolicyAction[]): Set<PolicyAction> {
  return new Set(actions);
}

function buildDefaults(): Record<string, Set<PolicyAction>> {
  const all: PolicyAction[] = ["READ", "CREATE", "UPDATE", "DELETE", "SUBMIT", "APPROVE", "CLOSE_PERIOD", "YEAR_END_CLOSE"];

  const matrix: Array<[MemberRole, PolicyResource, PolicyAction[]]> = [
    // OWNER — 全部
    ["OWNER", "JOURNAL_ENTRY",    all],
    ["OWNER", "CHART_OF_ACCOUNT", all],
    ["OWNER", "FISCAL_PERIOD",    all],
    ["OWNER", "REPORT",           all],
    ["OWNER", "COMPANY",          all],
    ["OWNER", "MEMBER",           all],
    ["OWNER", "CURRENCY",         all],
    ["OWNER", "FIXED_ASSET",      all],
    ["OWNER", "AR_INVOICE",       all],
    ["OWNER", "AP_INVOICE",       all],
    ["OWNER", "VAT_RECORD",       all],

    // ADMIN — 除 MEMBER.DELETE 外的所有
    ["ADMIN", "JOURNAL_ENTRY",    all],
    ["ADMIN", "CHART_OF_ACCOUNT", all],
    ["ADMIN", "FISCAL_PERIOD",    ["READ", "CLOSE_PERIOD", "YEAR_END_CLOSE"]],
    ["ADMIN", "REPORT",           all],
    ["ADMIN", "COMPANY",          ["READ", "CREATE", "UPDATE"]],
    ["ADMIN", "MEMBER",           ["READ", "CREATE", "UPDATE"]],
    ["ADMIN", "CURRENCY",         all],
    ["ADMIN", "FIXED_ASSET",      all],
    ["ADMIN", "AR_INVOICE",       all],
    ["ADMIN", "AP_INVOICE",       all],
    ["ADMIN", "VAT_RECORD",       all],

    // ACCOUNTANT
    ["ACCOUNTANT", "JOURNAL_ENTRY",    ["READ", "CREATE", "UPDATE", "SUBMIT"]],
    ["ACCOUNTANT", "CHART_OF_ACCOUNT", ["READ"]],
    ["ACCOUNTANT", "FISCAL_PERIOD",    ["READ"]],
    ["ACCOUNTANT", "REPORT",           ["READ"]],
    ["ACCOUNTANT", "COMPANY",          ["READ"]],
    ["ACCOUNTANT", "MEMBER",           []],
    ["ACCOUNTANT", "CURRENCY",         ["READ"]],
    ["ACCOUNTANT", "FIXED_ASSET",      ["READ", "CREATE", "UPDATE"]],
    ["ACCOUNTANT", "AR_INVOICE",       ["READ", "CREATE", "UPDATE"]],
    ["ACCOUNTANT", "AP_INVOICE",       ["READ", "CREATE", "UPDATE"]],
    ["ACCOUNTANT", "VAT_RECORD",       ["READ", "CREATE", "UPDATE"]],

    // AUDITOR — 全只读
    ["AUDITOR", "JOURNAL_ENTRY",    ["READ"]],
    ["AUDITOR", "CHART_OF_ACCOUNT", ["READ"]],
    ["AUDITOR", "FISCAL_PERIOD",    ["READ"]],
    ["AUDITOR", "REPORT",           ["READ"]],
    ["AUDITOR", "COMPANY",          ["READ"]],
    ["AUDITOR", "MEMBER",           ["READ"]],
    ["AUDITOR", "CURRENCY",         ["READ"]],
    ["AUDITOR", "FIXED_ASSET",      ["READ"]],
    ["AUDITOR", "AR_INVOICE",       ["READ"]],
    ["AUDITOR", "AP_INVOICE",       ["READ"]],
    ["AUDITOR", "VAT_RECORD",       ["READ"]],

    // PERIOD_MANAGER
    ["PERIOD_MANAGER", "JOURNAL_ENTRY",    ["READ"]],
    ["PERIOD_MANAGER", "CHART_OF_ACCOUNT", ["READ"]],
    ["PERIOD_MANAGER", "FISCAL_PERIOD",    ["READ", "CLOSE_PERIOD", "YEAR_END_CLOSE"]],
    ["PERIOD_MANAGER", "REPORT",           ["READ"]],
    ["PERIOD_MANAGER", "COMPANY",          ["READ"]],
    ["PERIOD_MANAGER", "MEMBER",           []],
    ["PERIOD_MANAGER", "CURRENCY",         ["READ"]],
    ["PERIOD_MANAGER", "FIXED_ASSET",      ["READ"]],
    ["PERIOD_MANAGER", "AR_INVOICE",       ["READ"]],
    ["PERIOD_MANAGER", "AP_INVOICE",       ["READ"]],
    ["PERIOD_MANAGER", "VAT_RECORD",       ["READ"]],
  ];

  const result: Record<string, Set<PolicyAction>> = {};
  for (const [role, resource, actions] of matrix) {
    result[`${role}:${resource}`] = a(...(actions as PolicyAction[]));
  }
  return result;
}

// ── 主检查函数 ────────────────────────────────────────────────────────
/**
 * 检查用户是否有权对指定资源执行指定动作。
 * @param userId     当前用户 ID
 * @param orgId      组织 ID（用于查自定义策略）
 * @param resource   被操作的资源类型
 * @param action     要执行的动作
 * @param companyId  可选：限定特定公司范围（companyScope 检查）
 */
export async function checkPermission(
  userId: string,
  orgId: string,
  resource: PolicyResource,
  action: PolicyAction,
  companyId?: string
): Promise<boolean> {
  // 获取用户角色
  const membership = await db.organizationMember.findFirst({
    where: { userId, organizationId: orgId },
    select: { role: true },
  });
  if (!membership) return false;

  const role = membership.role;

  // OWNER 永远有权
  if (role === "OWNER") return true;

  // 查数据库自定义策略（优先全局策略 companyScope=null，其次公司范围策略）
  const customPolicies = await db.rolePolicy.findMany({
    where: {
      organizationId: orgId,
      role,
      resource,
      OR: [
        { companyScope: null },
        ...(companyId ? [{ companyScope: companyId }] : []),
      ],
    },
    select: { actions: true, companyScope: true },
  });

  if (customPolicies.length > 0) {
    // 合并所有匹配策略的 actions（any match = allowed）
    const allowed = new Set<PolicyAction>();
    for (const p of customPolicies) {
      for (const a of p.actions) allowed.add(a);
    }
    return allowed.has(action);
  }

  // 回退到系统默认策略
  const defaultSet = DEFAULT_POLICIES[`${role}:${resource}`];
  return defaultSet ? defaultSet.has(action) : false;
}

/**
 * 获取指定角色在所有资源上的默认权限（用于 UI 初始化）
 */
export function getDefaultActionsForRole(
  role: MemberRole,
  resource: PolicyResource
): PolicyAction[] {
  const key = `${role}:${resource}`;
  return Array.from(DEFAULT_POLICIES[key] ?? []);
}

// 导出所有资源和动作枚举值列表（供 UI 遍历）
export const ALL_RESOURCES: PolicyResource[] = [
  "JOURNAL_ENTRY",
  "CHART_OF_ACCOUNT",
  "FISCAL_PERIOD",
  "REPORT",
  "COMPANY",
  "MEMBER",
  "CURRENCY",
  "FIXED_ASSET",
  "AR_INVOICE",
  "AP_INVOICE",
  "VAT_RECORD",
];

export const ALL_ACTIONS: PolicyAction[] = [
  "READ",
  "CREATE",
  "UPDATE",
  "DELETE",
  "SUBMIT",
  "APPROVE",
  "CLOSE_PERIOD",
  "YEAR_END_CLOSE",
];

export const RESOURCE_LABELS: Record<PolicyResource, string> = {
  JOURNAL_ENTRY:    "日记账凭证",
  CHART_OF_ACCOUNT: "科目表",
  FISCAL_PERIOD:    "会计期间",
  REPORT:           "财务报表",
  COMPANY:          "公司管理",
  MEMBER:           "成员管理",
  CURRENCY:         "货币汇率",
  FIXED_ASSET:      "固定资产",
  AR_INVOICE:       "应收发票",
  AP_INVOICE:       "应付发票",
  VAT_RECORD:       "增值税记录",
};

export const ACTION_LABELS: Record<PolicyAction, string> = {
  READ:           "查看",
  CREATE:         "新建",
  UPDATE:         "编辑",
  DELETE:         "删除",
  SUBMIT:         "提交审批",
  APPROVE:        "审批过账",
  CLOSE_PERIOD:   "关闭期间",
  YEAR_END_CLOSE: "年末结账",
};

export const ROLE_LABELS: Record<MemberRole, string> = {
  OWNER:          "所有者（OWNER）",
  ADMIN:          "管理员（ADMIN）",
  ACCOUNTANT:     "会计（ACCOUNTANT）",
  AUDITOR:        "审计员（AUDITOR）",
  PERIOD_MANAGER: "期间管理员（PERIOD_MANAGER）",
};

// 可配置的角色（OWNER 不可配置）
export const CONFIGURABLE_ROLES: MemberRole[] = [
  "ADMIN",
  "ACCOUNTANT",
  "AUDITOR",
  "PERIOD_MANAGER",
];
