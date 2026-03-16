"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound, Loader2, Copy, CheckCheck } from "lucide-react";

interface Props {
  memberId: string;
  userName: string;
}

export function ResetPasswordButton({ memberId, userName }: Props) {
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleReset = async () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setConfirmed(false);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/organizations/members/${memberId}/reset-password`,
        { method: "POST" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "重置失败");
        return;
      }
      setTempPassword(data.tempPassword);
      toast.success(`${userName} 的密码已重置，请将临时密码告知用户`);
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 显示临时密码
  if (tempPassword) {
    return (
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-1.5">
        <span className="font-mono text-sm font-medium text-amber-800">{tempPassword}</span>
        <button
          onClick={handleCopy}
          className="text-amber-600 hover:text-amber-800"
          title="复制临时密码"
        >
          {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </button>
        <button
          onClick={() => setTempPassword(null)}
          className="text-xs text-amber-600 hover:text-amber-800 ml-1"
        >
          关闭
        </button>
      </div>
    );
  }

  // 二次确认
  if (confirmed) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-red-600">确认重置密码？</span>
        <button
          onClick={handleReset}
          className="text-xs text-red-600 underline hover:no-underline"
          disabled={loading}
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "确认"}
        </button>
        <button
          onClick={() => setConfirmed(false)}
          className="text-xs text-muted-foreground underline hover:no-underline"
        >
          取消
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={handleReset}
      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-orange-600 transition-colors"
      title={`重置 ${userName} 的密码`}
    >
      <KeyRound className="h-3.5 w-3.5" />
      重置密码
    </button>
  );
}
