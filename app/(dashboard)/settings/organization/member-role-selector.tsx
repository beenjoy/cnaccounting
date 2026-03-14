"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const ROLE_OPTIONS = [
  { value: "ADMIN",          label: "管理员" },
  { value: "ACCOUNTANT",     label: "会计" },
  { value: "AUDITOR",        label: "审计员" },
  { value: "PERIOD_MANAGER", label: "期间管理员" },
] as const;

const ROLE_LABELS: Record<string, string> = {
  OWNER:          "所有者",
  ADMIN:          "管理员",
  ACCOUNTANT:     "会计",
  AUDITOR:        "审计员",
  PERIOD_MANAGER: "期间管理员",
};

interface Props {
  memberId: string;
  currentRole: string;
}

export function MemberRoleSelector({ memberId, currentRole }: Props) {
  const [role, setRole] = useState(currentRole);
  const [loading, setLoading] = useState(false);

  const handleChange = async (newRole: string) => {
    if (newRole === role) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/organizations/members/${memberId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "修改失败");
        return;
      }
      setRole(newRole);
      toast.success(`角色已更新为：${ROLE_LABELS[newRole] ?? newRole}`);
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <select
        value={role}
        onChange={(e) => handleChange(e.target.value)}
        disabled={loading}
        className="rounded-md border border-input bg-background px-2 py-1 text-xs font-medium disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-ring"
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
