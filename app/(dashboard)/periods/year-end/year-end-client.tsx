"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  fiscalYearId: string;
  yearLabel: string;
}

export function YearEndCloseButton({ fiscalYearId, yearLabel }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleClose = async () => {
    if (!confirmed) {
      setConfirmed(true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/fiscal-years/${fiscalYearId}/year-end-close`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? "年末结账失败");
        setConfirmed(false);
        return;
      }
      toast.success("年末结账完成！已自动生成损益结转和盈余公积凭证。");
      router.refresh();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {confirmed && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">确认执行年末结账？</p>
            <p className="mt-0.5 text-xs">此操作将：① 生成损益结转凭证（收入/费用归零，计入本年利润）；② 按净利润 10% 计提法定盈余公积；③ 将 {yearLabel} 标记为已关闭，不可再新建或修改凭证。</p>
          </div>
        </div>
      )}
      <Button
        onClick={handleClose}
        disabled={loading}
        variant={confirmed ? "destructive" : "default"}
        className="w-full sm:w-auto"
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {confirmed ? "确认执行年末结账" : "执行年末结账"}
      </Button>
      {confirmed && (
        <button
          type="button"
          onClick={() => setConfirmed(false)}
          className="ml-3 text-sm text-muted-foreground hover:underline"
        >
          取消
        </button>
      )}
    </div>
  );
}
