"use client";

import { useState, useTransition } from "react";
import type { PolicyResource, PolicyAction, MemberRole } from "@prisma/client";
import { RESOURCE_LABELS, ACTION_LABELS, ROLE_LABELS, CONFIGURABLE_ROLES } from "@/lib/permissions";
import { PolicyWizard } from "./policy-wizard";

type PolicyRow = {
  role: MemberRole;
  resource: PolicyResource;
  actions: PolicyAction[];
  isCustom: boolean;
};

interface Props {
  initialMatrix: PolicyRow[];
  allResources: PolicyResource[];
  allActions: PolicyAction[];
}

// 将矩阵数组转换为嵌套 Map 结构，方便查询
function buildLookup(matrix: PolicyRow[]) {
  const lookup = new Map<string, Set<PolicyAction>>();
  for (const row of matrix) {
    lookup.set(`${row.role}:${row.resource}`, new Set(row.actions));
  }
  return lookup;
}

export function PermissionMatrix({ initialMatrix, allResources, allActions }: Props) {
  const [matrix, setMatrix] = useState<PolicyRow[]>(initialMatrix);
  const [selectedRole, setSelectedRole] = useState<MemberRole>(CONFIGURABLE_ROLES[0]);
  const [isPending, startTransition] = useTransition();
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const lookup = buildLookup(matrix);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  }

  function hasAction(role: MemberRole, resource: PolicyResource, action: PolicyAction): boolean {
    return lookup.get(`${role}:${resource}`)?.has(action) ?? false;
  }

  function isCustomRow(role: MemberRole, resource: PolicyResource): boolean {
    return matrix.find((r) => r.role === role && r.resource === resource)?.isCustom ?? false;
  }

  function toggleAction(resource: PolicyResource, action: PolicyAction) {
    // 乐观更新本地状态
    const key = `${selectedRole}:${resource}`;
    const currentSet = new Set(lookup.get(key) ?? []);
    if (currentSet.has(action)) {
      currentSet.delete(action);
    } else {
      currentSet.add(action);
    }
    const newActions = Array.from(currentSet) as PolicyAction[];

    setMatrix((prev) =>
      prev.map((row) =>
        row.role === selectedRole && row.resource === resource
          ? { ...row, actions: newActions, isCustom: true }
          : row
      )
    );

    // 持久化到服务器
    const saveKey = `${selectedRole}:${resource}`;
    setSavingKey(saveKey);
    startTransition(async () => {
      try {
        const res = await fetch("/api/role-policies", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: selectedRole, resource, actions: newActions }),
        });
        if (!res.ok) {
          const data = await res.json() as { error?: string };
          showToast(data.error ?? "保存失败", false);
          // 回滚
          setMatrix(initialMatrix);
        }
      } catch {
        showToast("网络错误，请重试", false);
        setMatrix(initialMatrix);
      } finally {
        setSavingKey(null);
      }
    });
  }

  async function handleWizardSaved() {
    // 向导保存完成后，重新拉取矩阵数据
    try {
      const dataRes = await fetch("/api/role-policies");
      const data = await dataRes.json() as { matrix: PolicyRow[] };
      setMatrix(data.matrix);
      showToast("策略已更新", true);
    } catch {
      showToast("策略已保存，刷新页面查看最新状态", true);
    }
  }

  async function resetToDefault(resource: PolicyResource) {
    const res = await fetch(
      `/api/role-policies?role=${selectedRole}&resource=${resource}`,
      { method: "DELETE" }
    );
    if (res.ok) {
      // 刷新数据
      const dataRes = await fetch("/api/role-policies");
      const data = await dataRes.json() as { matrix: PolicyRow[] };
      setMatrix(data.matrix);
      showToast("已重置为系统默认", true);
    } else {
      showToast("重置失败", false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm shadow-lg ${
            toast.ok ? "bg-green-50 text-green-800 border border-green-200" : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          {toast.msg}
        </div>
      )}

      {/* 角色选择 Tabs + 向导按钮 */}
      <div className="flex items-center justify-between border-b">
        <div className="flex gap-2">
          {CONFIGURABLE_ROLES.map((role) => (
            <button
              key={role}
              onClick={() => setSelectedRole(role)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
                selectedRole === role
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {ROLE_LABELS[role].split("（")[0]}
            </button>
          ))}
        </div>
        <button
          onClick={() => setWizardOpen(true)}
          className="mb-1 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          快速配置向导
        </button>
      </div>

      <PolicyWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        onSaved={handleWizardSaved}
      />

      {/* 说明 */}
      <p className="text-sm text-muted-foreground">
        当前编辑角色：<span className="font-medium text-foreground">{ROLE_LABELS[selectedRole]}</span>
        。勾选即立即保存。自定义策略优先于系统默认策略。
      </p>

      {/* 权限矩阵表格 */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground w-36">资源</th>
              {allActions.map((action) => (
                <th key={action} className="px-3 py-3 text-center font-medium text-muted-foreground whitespace-nowrap">
                  {ACTION_LABELS[action]}
                </th>
              ))}
              <th className="px-3 py-3 text-center font-medium text-muted-foreground">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {allResources.map((resource) => {
              const rowKey = `${selectedRole}:${resource}`;
              const isSaving = savingKey === rowKey;
              const custom = isCustomRow(selectedRole, resource);
              return (
                <tr key={resource} className={`hover:bg-muted/20 transition-colors ${isSaving ? "opacity-60" : ""}`}>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      {RESOURCE_LABELS[resource]}
                      {custom && (
                        <span className="text-xs bg-blue-50 text-blue-600 border border-blue-200 rounded px-1">
                          自定义
                        </span>
                      )}
                    </div>
                  </td>
                  {allActions.map((action) => (
                    <td key={action} className="px-3 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={hasAction(selectedRole, resource, action)}
                        onChange={() => toggleAction(resource, action)}
                        disabled={isSaving}
                        className="h-4 w-4 rounded border-gray-300 text-primary accent-primary cursor-pointer disabled:opacity-50"
                        title={`${ROLE_LABELS[selectedRole]} ${ACTION_LABELS[action]} ${RESOURCE_LABELS[resource]}`}
                      />
                    </td>
                  ))}
                  <td className="px-3 py-3 text-center">
                    {custom && (
                      <button
                        onClick={() => resetToDefault(resource)}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        title="重置为系统默认权限"
                      >
                        重置
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 说明卡片 */}
      <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-sm">权限说明</p>
        <p>• <strong>所有者（OWNER）</strong>拥有全部权限，不受此矩阵限制。</p>
        <p>• 标记「自定义」的行表示已覆盖系统默认策略，点击「重置」可恢复默认。</p>
        <p>• 更改即时生效，下次该角色用户操作时将应用新策略。</p>
        <p>• 动作说明：查看（只读）、新建、编辑、删除、提交审批、审批过账、关闭期间、年末结账。</p>
      </div>
    </div>
  );
}
