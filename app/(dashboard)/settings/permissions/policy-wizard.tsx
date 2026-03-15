"use client";

import { useState, useTransition } from "react";
import type { PolicyResource, PolicyAction, MemberRole } from "@prisma/client";
import {
  ALL_RESOURCES,
  ALL_ACTIONS,
  RESOURCE_LABELS,
  ACTION_LABELS,
  ROLE_LABELS,
  CONFIGURABLE_ROLES,
} from "@/lib/permissions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// 每个角色的简要说明
const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: "可管理大多数业务，适合财务主管",
  ACCOUNTANT: "负责日常凭证录入和提交",
  AUDITOR: "只读审计，查看所有报表和凭证",
  PERIOD_MANAGER: "负责会计期间的开关操作",
};

// 快速预设
const PRESETS: Array<{ label: string; actions: PolicyAction[] }> = [
  { label: "只读", actions: ["READ"] },
  {
    label: "标准",
    actions: ["READ", "CREATE", "UPDATE", "SUBMIT"],
  },
  { label: "完全访问", actions: ALL_ACTIONS as PolicyAction[] },
];

// 动作分组显示
const ACTION_GROUPS: Array<{ label: string; actions: PolicyAction[] }> = [
  {
    label: "基础操作",
    actions: ["READ", "CREATE", "UPDATE", "DELETE"],
  },
  {
    label: "审批流程",
    actions: ["SUBMIT", "APPROVE"],
  },
  {
    label: "期间管理",
    actions: ["CLOSE_PERIOD", "YEAR_END_CLOSE"],
  },
];

interface PolicyWizardProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function PolicyWizard({ open, onClose, onSaved }: PolicyWizardProps) {
  const [step, setStep] = useState(1);
  const [selectedRole, setSelectedRole] = useState<MemberRole | null>(null);
  const [selectedActions, setSelectedActions] = useState<Set<PolicyAction>>(new Set(["READ"]));
  const [selectedResources, setSelectedResources] = useState<Set<PolicyResource>>(new Set());
  const [isPending, startTransition] = useTransition();
  const [saveError, setSaveError] = useState<string | null>(null);

  function resetWizard() {
    setStep(1);
    setSelectedRole(null);
    setSelectedActions(new Set(["READ"]));
    setSelectedResources(new Set());
    setSaveError(null);
  }

  function handleClose() {
    resetWizard();
    onClose();
  }

  // ── Step 2 helpers ──────────────────────────────────────────────────────

  function applyPreset(actions: PolicyAction[]) {
    setSelectedActions(new Set(actions));
  }

  function toggleAction(action: PolicyAction) {
    setSelectedActions((prev) => {
      const next = new Set(prev);
      if (next.has(action)) {
        next.delete(action);
      } else {
        next.add(action);
      }
      return next;
    });
  }

  function matchesPreset(preset: PolicyAction[]): boolean {
    if (selectedActions.size !== preset.length) return false;
    return preset.every((a) => selectedActions.has(a));
  }

  // ── Step 3 helpers ──────────────────────────────────────────────────────

  function toggleResource(resource: PolicyResource) {
    setSelectedResources((prev) => {
      const next = new Set(prev);
      if (next.has(resource)) {
        next.delete(resource);
      } else {
        next.add(resource);
      }
      return next;
    });
  }

  function selectAllResources() {
    setSelectedResources(new Set(ALL_RESOURCES as PolicyResource[]));
  }

  function clearResources() {
    setSelectedResources(new Set());
  }

  // ── Step 4: 提交 ────────────────────────────────────────────────────────

  function handleSave() {
    if (!selectedRole || selectedResources.size === 0) return;
    const actions = Array.from(selectedActions) as PolicyAction[];
    const resources = Array.from(selectedResources) as PolicyResource[];

    setSaveError(null);
    startTransition(async () => {
      try {
        for (const resource of resources) {
          const res = await fetch("/api/role-policies", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role: selectedRole, resource, actions }),
          });
          if (!res.ok) {
            const data = await res.json() as { error?: string };
            setSaveError(data.error ?? "保存失败");
            return;
          }
        }
        onSaved();
        handleClose();
      } catch {
        setSaveError("网络错误，请重试");
      }
    });
  }

  // ── 步骤标签 ─────────────────────────────────────────────────────────────

  const steps = [
    { num: 1, label: "角色" },
    { num: 2, label: "操作" },
    { num: 3, label: "资源" },
    { num: 4, label: "确认" },
  ];

  const canProceedStep1 = selectedRole !== null;
  const canProceedStep2 = selectedActions.size > 0;
  const canProceedStep3 = selectedResources.size > 0;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>快速配置权限向导</DialogTitle>
        </DialogHeader>

        {/* 步骤指示器 */}
        <div className="flex items-center gap-0 mb-6">
          {steps.map((s, idx) => (
            <div key={s.num} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                    step === s.num
                      ? "bg-primary text-primary-foreground"
                      : step > s.num
                      ? "bg-primary/20 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {s.num}
                </div>
                <span className={`text-xs whitespace-nowrap ${step === s.num ? "text-primary font-medium" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 mb-5 ${step > s.num ? "bg-primary/40" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Step 1 — 角色选择 */}
        {step === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">选择要配置权限的角色：</p>
            <div className="grid grid-cols-2 gap-3">
              {CONFIGURABLE_ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setSelectedRole(role)}
                  className={`rounded-lg border-2 p-4 text-left transition-all hover:border-primary/50 ${
                    selectedRole === role
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <div className="font-medium text-sm">
                    {ROLE_LABELS[role].split("（")[0]}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {ROLE_DESCRIPTIONS[role]}
                  </div>
                  {selectedRole === role && (
                    <div className="mt-2">
                      <Badge variant="default" className="text-xs">已选择</Badge>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — 操作权限选择 */}
        {step === 2 && (
          <div className="space-y-5">
            <p className="text-sm text-muted-foreground">
              为 <span className="font-medium text-foreground">{selectedRole ? ROLE_LABELS[selectedRole].split("（")[0] : ""}</span> 选择允许的操作：
            </p>

            {/* 快速预设 */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">快速预设</p>
              <div className="flex gap-2 flex-wrap">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => applyPreset(preset.actions)}
                    className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
                      matchesPreset(preset.actions)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border hover:border-primary/50 hover:bg-muted"
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 细化复选框 */}
            <div className="space-y-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">细化配置</p>
              {ACTION_GROUPS.map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="text-xs text-muted-foreground font-medium">{group.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {group.actions.map((action) => (
                      <label
                        key={action}
                        className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedActions.has(action)}
                          onChange={() => toggleAction(action)}
                          className="h-4 w-4 rounded border-gray-300 text-primary accent-primary"
                        />
                        <span className="text-sm">{ACTION_LABELS[action]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {selectedActions.size === 0 && (
              <p className="text-xs text-amber-600">请至少选择一个操作权限</p>
            )}
          </div>
        )}

        {/* Step 3 — 资源范围选择 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                选择上述权限适用的资源（可多选）：
              </p>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={selectAllResources}
                  className="text-primary hover:underline"
                >
                  全选
                </button>
                <span className="text-muted-foreground">·</span>
                <button
                  type="button"
                  onClick={clearResources}
                  className="text-muted-foreground hover:text-foreground hover:underline"
                >
                  清空
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(ALL_RESOURCES as PolicyResource[]).map((resource) => (
                <label
                  key={resource}
                  className={`flex items-center gap-3 rounded-md border-2 px-4 py-3 cursor-pointer transition-all hover:border-primary/50 ${
                    selectedResources.has(resource)
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedResources.has(resource)}
                    onChange={() => toggleResource(resource)}
                    className="h-4 w-4 rounded border-gray-300 text-primary accent-primary"
                  />
                  <span className="text-sm font-medium">{RESOURCE_LABELS[resource]}</span>
                </label>
              ))}
            </div>
            {selectedResources.size === 0 && (
              <p className="text-xs text-amber-600">请至少选择一个资源</p>
            )}
          </div>
        )}

        {/* Step 4 — 确认摘要 */}
        {step === 4 && selectedRole && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">请确认以下配置将被保存：</p>

            <div className="rounded-lg border bg-muted/20 p-4 space-y-3">
              <div className="flex gap-3">
                <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">角色</span>
                <Badge variant="default">{ROLE_LABELS[selectedRole].split("（")[0]}</Badge>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">操作权限</span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedActions.size === 0 ? (
                    <span className="text-xs text-muted-foreground italic">无（禁止访问）</span>
                  ) : (
                    Array.from(selectedActions).map((a) => (
                      <Badge key={a} variant="outline" className="text-xs">
                        {ACTION_LABELS[a]}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="text-sm font-medium text-muted-foreground w-16 shrink-0">资源范围</span>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from(selectedResources).map((r) => (
                    <Badge key={r} variant="secondary" className="text-xs">
                      {RESOURCE_LABELS[r]}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-700">
              将覆盖所选 <strong>{selectedResources.size}</strong> 个资源的现有策略。此操作即时生效。
            </div>

            {saveError && (
              <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
                保存失败：{saveError}
              </div>
            )}
          </div>
        )}

        {/* 底部导航 */}
        <div className="flex justify-between pt-4 border-t mt-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (step === 1) {
                handleClose();
              } else {
                setStep((s) => s - 1);
              }
            }}
          >
            {step === 1 ? "取消" : "上一步"}
          </Button>

          {step < 4 ? (
            <Button
              type="button"
              onClick={() => setStep((s) => s + 1)}
              disabled={
                (step === 1 && !canProceedStep1) ||
                (step === 2 && !canProceedStep2) ||
                (step === 3 && !canProceedStep3)
              }
            >
              下一步
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSave}
              disabled={isPending || selectedResources.size === 0}
            >
              {isPending ? "保存中..." : "确认保存"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
