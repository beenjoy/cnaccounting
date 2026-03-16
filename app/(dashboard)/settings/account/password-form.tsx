"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PasswordStrength {
  minLength: boolean;
  hasLetter: boolean;
  hasNumber: boolean;
}

function getStrength(pwd: string): PasswordStrength {
  return {
    minLength: pwd.length >= 8,
    hasLetter: /[A-Za-z]/.test(pwd),
    hasNumber: /[0-9]/.test(pwd),
  };
}

function StrengthItem({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${ok ? "text-green-600" : "text-muted-foreground"}`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {label}
    </span>
  );
}

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const strength = getStrength(newPwd);
  const allPassed = strength.minLength && strength.hasLetter && strength.hasNumber;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) { toast.error("请输入当前密码"); return; }
    if (!allPassed) { toast.error("新密码不满足强度要求"); return; }
    if (newPwd !== confirm) { toast.error("两次输入的新密码不一致"); return; }

    setLoading(true);
    try {
      const res = await fetch("/api/user/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: current, newPassword: newPwd, confirmPassword: confirm }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "修改失败");
        return;
      }
      toast.success("密码已修改，下次登录时使用新密码");
      // 清空表单
      setCurrent("");
      setNewPwd("");
      setConfirm("");
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 当前密码 */}
      <div className="space-y-2">
        <Label htmlFor="current-pwd">当前密码</Label>
        <div className="relative">
          <Input
            id="current-pwd"
            type={showCurrent ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="输入当前密码"
            className="pr-10"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowCurrent(!showCurrent)}
          >
            {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* 新密码 */}
      <div className="space-y-2">
        <Label htmlFor="new-pwd">新密码</Label>
        <div className="relative">
          <Input
            id="new-pwd"
            type={showNew ? "text" : "password"}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="输入新密码"
            className="pr-10"
          />
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setShowNew(!showNew)}
          >
            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {newPwd && (
          <div className="flex flex-wrap gap-3 mt-1">
            <StrengthItem ok={strength.minLength} label="至少8位" />
            <StrengthItem ok={strength.hasLetter} label="含字母" />
            <StrengthItem ok={strength.hasNumber} label="含数字" />
          </div>
        )}
      </div>

      {/* 确认新密码 */}
      <div className="space-y-2">
        <Label htmlFor="confirm-pwd">确认新密码</Label>
        <Input
          id="confirm-pwd"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="再次输入新密码"
        />
        {confirm && newPwd !== confirm && (
          <p className="text-xs text-red-500">两次输入不一致</p>
        )}
        {confirm && newPwd === confirm && confirm.length > 0 && (
          <p className="text-xs text-green-600 flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" /> 密码一致
          </p>
        )}
      </div>

      <Button
        type="submit"
        disabled={loading || !allPassed || newPwd !== confirm || !current}
        size="sm"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        修改密码
      </Button>
    </form>
  );
}
