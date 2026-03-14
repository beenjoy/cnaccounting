"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Company {
  id: string;
  name: string;
  code: string;
}

interface Props {
  groupId: string;
  availableCompanies: Company[];
  hasParent: boolean;
  mode: "add" | "remove";
  memberId?: string;
  memberType?: string;
  ownershipPct?: number;
  consolidationMethod?: string;
  investmentAccountCode?: string;
}

export function MemberActions({
  groupId, availableCompanies, hasParent, mode,
  memberId, memberType, ownershipPct = 1.0,
  consolidationMethod = "FULL", investmentAccountCode = "",
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Add form
  const [companyId, setCompanyId] = useState(availableCompanies[0]?.id ?? "");
  const [mType, setMType] = useState<"PARENT" | "SUBSIDIARY">("SUBSIDIARY");
  const [pct, setPct] = useState("100");
  const [method, setMethod] = useState("FULL");
  const [investCode, setInvestCode] = useState("");

  async function handleAdd() {
    if (!companyId) { setError("请选择公司"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/consolidation-groups/${groupId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          memberType: mType,
          ownershipPct: mType === "PARENT" ? 1 : parseFloat(pct) / 100,
          consolidationMethod: method,
          investmentAccountCode: investCode.trim() || null,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "添加失败"); return; }
      setOpen(false);
      setCompanyId(availableCompanies[0]?.id ?? "");
      setMType("SUBSIDIARY"); setPct("100"); setMethod("FULL"); setInvestCode("");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!memberId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/consolidation-groups/${groupId}/members/${memberId}`, {
        method: "DELETE",
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "移除失败"); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (mode === "remove") {
    return (
      <>
        <button onClick={() => setOpen(true)}
          className="text-xs text-red-500 hover:underline">
          移除
        </button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-lg p-6 w-80">
              <h3 className="font-semibold mb-2">确认移除成员</h3>
              <p className="text-sm text-muted-foreground mb-4">
                确定要从合并组中移除该{memberType === "PARENT" ? "母公司" : "子公司"}吗？
              </p>
              {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setOpen(false); setError(""); }}
                  className="px-4 py-1.5 text-sm border rounded hover:bg-muted">取消</button>
                <button onClick={handleRemove} disabled={loading}
                  className="px-4 py-1.5 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                  {loading ? "移除中..." : "确认移除"}
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
        className="rounded-md bg-secondary px-3 py-1.5 text-sm font-medium hover:bg-secondary/80">
        + 添加成员
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md">
            <h3 className="font-semibold mb-4">添加成员公司</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">选择公司 *</label>
                <select value={companyId} onChange={e => setCompanyId(e.target.value)}
                  className="w-full rounded-md border px-3 py-2 text-sm">
                  {availableCompanies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}（{c.code}）</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">成员类型</label>
                <select value={mType} onChange={e => setMType(e.target.value as "PARENT" | "SUBSIDIARY")}
                  className="w-full rounded-md border px-3 py-2 text-sm">
                  {!hasParent && <option value="PARENT">母公司</option>}
                  <option value="SUBSIDIARY">子公司</option>
                </select>
              </div>
              {mType === "SUBSIDIARY" && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">持股比例 (%)</label>
                    <input type="number" value={pct} onChange={e => setPct(e.target.value)}
                      min="0" max="100" step="0.01"
                      className="w-full rounded-md border px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">合并方法</label>
                    <select value={method} onChange={e => setMethod(e.target.value)}
                      className="w-full rounded-md border px-3 py-2 text-sm">
                      <option value="FULL">全额合并（控股，持股 &gt;50%）</option>
                      <option value="EQUITY">权益法（联营，持股20–50%）</option>
                      <option value="COST">成本法（持股 &lt;20%）</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">长期股权投资科目编码</label>
                    <input value={investCode} onChange={e => setInvestCode(e.target.value)}
                      placeholder="例如：1511（在母公司科目表中）"
                      className="w-full rounded-md border px-3 py-2 text-sm" />
                    <p className="text-xs text-muted-foreground mt-1">
                      母公司中对应该子公司的长期股权投资科目，用于投资抵消
                    </p>
                  </div>
                </>
              )}
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => { setOpen(false); setError(""); }}
                className="px-4 py-1.5 text-sm border rounded hover:bg-muted">取消</button>
              <button onClick={handleAdd} disabled={loading}
                className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50">
                {loading ? "添加中..." : "添加"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
