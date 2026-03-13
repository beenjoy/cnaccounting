"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, XCircle, BookOpen, RotateCcw } from "lucide-react";

type MemberRole = "OWNER" | "ADMIN" | "ACCOUNTANT" | "AUDITOR" | "PERIOD_MANAGER";

interface JournalActionsProps {
  entryId: string;
  status: string;
  userRole: MemberRole;
  createdById: string;
  currentUserId: string;
}

export function JournalActions({
  entryId,
  status,
  userRole,
  createdById,
  currentUserId,
}: JournalActionsProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<
    "approve" | "reject" | "post" | "reverse" | null
  >(null);
  const [isPending, setIsPending] = useState(false);

  const canApprove =
    status === "PENDING_APPROVAL" &&
    createdById !== currentUserId;

  const canPost = status === "APPROVED";

  const canReverse = status === "POSTED";

  const actionConfig = {
    approve: {
      label: "审批通过",
      icon: CheckCircle,
      variant: "default" as const,
      description: "审批通过后，凭证状态将变为「已审批」",
    },
    reject: {
      label: "退回",
      icon: XCircle,
      variant: "outline" as const,
      description: "退回后，凭证状态将变回「草稿」",
    },
    post: {
      label: "过账",
      icon: BookOpen,
      variant: "default" as const,
      description: "过账后，凭证将正式记入账簿，无法再修改",
    },
    reverse: {
      label: "冲销",
      icon: RotateCcw,
      variant: "destructive" as const,
      description: "将生成一张反向冲销凭证",
    },
  };

  const handleAction = (action: typeof pendingAction) => {
    setPendingAction(action);
    setConfirmOpen(true);
  };

  const confirmAction = async () => {
    if (!pendingAction) return;
    setIsPending(true);
    try {
      const response = await fetch(`/api/journals/${entryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: pendingAction }),
      });

      const result = await response.json();
      if (!response.ok) {
        toast.error(result.error || "操作失败");
        return;
      }

      const successMsg = {
        approve: "凭证已审批通过",
        reject: "凭证已退回",
        post: "凭证已过账",
        reverse: "冲销凭证已生成",
      }[pendingAction];

      toast.success(successMsg);
      setConfirmOpen(false);
      router.refresh();

      if (pendingAction === "reverse" && result.reversalEntryId) {
        router.push(`/journals/${result.reversalEntryId}`);
      }
    } finally {
      setIsPending(false);
    }
  };

  if (!canApprove && !canPost && !canReverse) return null;

  const config = pendingAction ? actionConfig[pendingAction] : null;

  return (
    <>
      <div className="flex items-center gap-2">
        {canApprove && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAction("reject")}
            >
              <XCircle className="mr-1 h-4 w-4" />
              退回
            </Button>
            <Button size="sm" onClick={() => handleAction("approve")}>
              <CheckCircle className="mr-1 h-4 w-4" />
              审批通过
            </Button>
          </>
        )}
        {canPost && (
          <Button size="sm" onClick={() => handleAction("post")}>
            <BookOpen className="mr-1 h-4 w-4" />
            过账
          </Button>
        )}
        {canReverse && (
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleAction("reverse")}
          >
            <RotateCcw className="mr-1 h-4 w-4" />
            冲销
          </Button>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{config?.label}确认</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{config?.description}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              取消
            </Button>
            <Button
              variant={config?.variant}
              onClick={confirmAction}
              disabled={isPending}
            >
              {isPending ? "处理中..." : "确认"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
