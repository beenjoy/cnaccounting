"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Company {
  id: string;
  name: string;
  code: string;
}

interface Props {
  organizationId: string;
  companies: Company[];
  mode: "create" | "delete";
  groupId?: string;
  groupName?: string;
}

export function GroupActions({ organizationId, companies, mode, groupId, groupName }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [reportingCurrency, setReportingCurrency] = useState("CNY");

  async function handleCreate() {
    if (!name.trim()) { setError("请输入合并组名称"); return; }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/consolidation-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, name, description, reportingCurrency }),
      });
      const data = await res.json() as { error?: string; id?: string };
      if (!res.ok) { setError(data.error ?? "创建失败"); return; }
      setOpen(false);
      setName(""); setDescription(""); setReportingCurrency("CNY");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!groupId) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/consolidation-groups/${groupId}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "删除失败"); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (mode === "delete") {
    return (
      <>
        <button onClick={() => setOpen(true)}
          className="text-xs text-red-500 hover:underline">
          删除
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-lg p-6 w-80">
              <h3 className="font-semibold mb-2">确认删除合并组</h3>
              <p className="text-sm text-muted-foreground mb-4">
                确定要删除合并组「{groupName}」吗？此操作不可撤销。
              </p>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setOpen(false); setError(""); }}
                  className="px-4 py-1.5 text-sm border rounded hover:bg-muted">
                  取消
                </button>
                <button onClick={handleDelete} disabled={loading}
                  className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                  {loading ? "删除中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        + 新建合并组
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4">新建合并组</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">合并组名称 *</label>
                <input value={name} onChange={e => setName(e.target.value)}
                  placeholder="例如：集团合并报表2026"
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">描述</label>
                <input value={description} onChange={e => setDescription(e.target.value)}
                  placeholder="可选备注"
                  className="w-full rounded-md border px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">报告货币</label>
                <select value={reportingCurrency} onChange={e => setReportingCurrency(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm">
                  <option value="CNY">人民币（CNY）</option>
                  <option value="USD">美元（USD）</option>
                  <option value="EUR">欧元（EUR）</option>
                  <option value="HKD">港元（HKD）</option>
                </select>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setOpen(false); setError(""); setName(""); setDescription(""); }}
                className="px-4 py-1.5 text-sm border rounded hover:bg-muted">
                取消
              </button>
              <button onClick={handleCreate} disabled={loading}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
                {loading ? "创建中..." : "创建"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
