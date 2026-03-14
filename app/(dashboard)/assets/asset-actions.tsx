"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Account { id: string; code: string; name: string; }

interface Asset {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  department?: string | null;
  location?: string | null;
  serialNumber?: string | null;
  acquisitionDate: Date;
  acquisitionCost: unknown;
  residualRate: unknown;
  usefulLifeMonths: number;
  depreciationMethod: string;
  totalWorkload?: unknown | null;
  costAccountId?: string | null;
  accDepAccountId?: string | null;
  depExpAccountId?: string | null;
  notes?: string | null;
}

interface Props {
  companyId: string;
  leafAccounts: Account[];
  mode?: "new" | "edit" | "delete" | "dispose";
  asset?: Asset;
}

const CATEGORIES = [
  { value: "BUILDINGS",        label: "房屋及建筑物" },
  { value: "MACHINERY",        label: "机器设备" },
  { value: "VEHICLES",         label: "运输设备" },
  { value: "ELECTRONICS",      label: "电子设备" },
  { value: "OFFICE_FURNITURE", label: "办公设备及家具" },
  { value: "OTHER",            label: "其他" },
];

const DEP_METHODS = [
  { value: "STRAIGHT_LINE",     label: "直线法（年限平均）" },
  { value: "DECLINING_BALANCE", label: "双倍余额递减法" },
  { value: "SUM_OF_YEARS",      label: "年数总和法" },
  { value: "USAGE_BASED",       label: "工作量法" },
];

export function AssetActions({ companyId, leafAccounts, mode = "new", asset }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    name: asset?.name ?? "",
    category: asset?.category ?? "ELECTRONICS",
    department: asset?.department ?? "",
    location: asset?.location ?? "",
    serialNumber: asset?.serialNumber ?? "",
    acquisitionDate: asset?.acquisitionDate
      ? new Date(asset.acquisitionDate).toISOString().slice(0, 10)
      : today,
    acquisitionCost: asset?.acquisitionCost != null ? String(asset.acquisitionCost) : "",
    residualRate: asset?.residualRate != null ? String(Number(asset.residualRate) * 100) : "5",
    usefulLifeMonths: asset?.usefulLifeMonths ? String(asset.usefulLifeMonths) : "60",
    depreciationMethod: asset?.depreciationMethod ?? "STRAIGHT_LINE",
    totalWorkload: asset?.totalWorkload != null ? String(asset.totalWorkload) : "",
    costAccountId: asset?.costAccountId ?? "",
    accDepAccountId: asset?.accDepAccountId ?? "",
    depExpAccountId: asset?.depExpAccountId ?? "",
    notes: asset?.notes ?? "",
  });

  const [disposeForm, setDisposeForm] = useState({
    disposalDate: today,
    disposalAmount: "0",
    disposalNotes: "",
  });

  // Derived: monthly depreciation preview
  const monthlyDep = (() => {
    const cost = parseFloat(form.acquisitionCost) || 0;
    const rate = (parseFloat(form.residualRate) || 0) / 100;
    const months = parseInt(form.usefulLifeMonths) || 1;
    const residual = cost * rate;
    if (form.depreciationMethod === "STRAIGHT_LINE") {
      return ((cost - residual) / months).toFixed(2);
    }
    return "—";
  })();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = {
        companyId,
        name: form.name,
        category: form.category,
        department: form.department || null,
        location: form.location || null,
        serialNumber: form.serialNumber || null,
        acquisitionDate: form.acquisitionDate,
        acquisitionCost: parseFloat(form.acquisitionCost),
        residualRate: parseFloat(form.residualRate) / 100,
        usefulLifeMonths: parseInt(form.usefulLifeMonths),
        depreciationMethod: form.depreciationMethod,
        totalWorkload: form.totalWorkload ? parseFloat(form.totalWorkload) : null,
        costAccountId: form.costAccountId || null,
        accDepAccountId: form.accDepAccountId || null,
        depExpAccountId: form.depExpAccountId || null,
        notes: form.notes || null,
      };
      const url = mode === "edit" ? `/api/fixed-assets/${asset!.id}` : "/api/fixed-assets";
      const method = mode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "操作失败"); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/fixed-assets/${asset!.id}`, { method: "DELETE" });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "删除失败"); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleDispose(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/fixed-assets/${asset!.id}/dispose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disposalDate: disposeForm.disposalDate,
          disposalAmount: parseFloat(disposeForm.disposalAmount) || 0,
          disposalNotes: disposeForm.disposalNotes || null,
          generateEntry: false,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "处置失败"); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  // ── Delete ──────────────────────────────────────────────
  if (mode === "delete") {
    return (
      <>
        <button onClick={() => setOpen(true)} className="text-xs text-red-500 hover:text-red-700">删除</button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
              <h3 className="text-base font-semibold mb-2">确认删除</h3>
              <p className="text-sm text-muted-foreground mb-1">删除资产 <strong>{asset?.assetNumber}</strong> {asset?.name}？</p>
              <p className="text-sm text-amber-600 mb-4">仅无折旧记录的资产可删除。</p>
              {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">取消</button>
                <button onClick={handleDelete} disabled={loading}
                  className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                  {loading ? "处理中..." : "确认删除"}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── Dispose ──────────────────────────────────────────────
  if (mode === "dispose") {
    const cost = Number(asset?.acquisitionCost ?? 0);
    const accDep = Number(asset?.residualRate ?? 0); // Not ideal but unused here for display
    return (
      <>
        <button onClick={() => setOpen(true)} className="text-xs text-orange-500 hover:text-orange-700">处置</button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 w-96">
              <h3 className="text-base font-semibold mb-4">资产处置 — {asset?.assetNumber}</h3>
              <form onSubmit={handleDispose} className="space-y-3">
                <div>
                  <label className="block text-sm font-medium mb-1">处置日期</label>
                  <input type="date" value={disposeForm.disposalDate}
                    onChange={(e) => setDisposeForm({ ...disposeForm, disposalDate: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">处置收入（0 = 报废）</label>
                  <input type="number" min="0" step="0.01" value={disposeForm.disposalAmount}
                    onChange={(e) => setDisposeForm({ ...disposeForm, disposalAmount: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">处置说明</label>
                  <textarea value={disposeForm.disposalNotes}
                    onChange={(e) => setDisposeForm({ ...disposeForm, disposalNotes: e.target.value })}
                    rows={2} className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                {error && <p className="text-sm text-red-600">{error}</p>}
                <div className="flex justify-end gap-2 pt-2">
                  <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">取消</button>
                  <button type="submit" disabled={loading}
                    className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50">
                    {loading ? "处理中..." : "确认处置"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
    );
  }

  // ── New / Edit ──────────────────────────────────────────────
  return (
    <>
      {mode === "edit" ? (
        <button onClick={() => setOpen(true)} className="text-xs text-blue-500 hover:text-blue-700">编辑</button>
      ) : (
        <button onClick={() => setOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          新增资产
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{mode === "edit" ? `编辑资产 — ${asset?.assetNumber}` : "新增固定资产"}</h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

              {/* Basic info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">资产名称 <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="如：办公电脑" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">资产分类</label>
                  <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm">
                    {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">使用部门</label>
                  <input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="如：管理部" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">存放地点</label>
                  <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="如：北京总部3楼" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">序列号</label>
                  <input value={form.serialNumber} onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="制造商编号" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">入账日期 <span className="text-red-500">*</span></label>
                  <input type="date" value={form.acquisitionDate}
                    onChange={(e) => setForm({ ...form, acquisitionDate: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
              </div>

              {/* Financial fields */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">折旧配置</p>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">原值 <span className="text-red-500">*</span></label>
                    <input type="number" min="0" step="0.01" value={form.acquisitionCost}
                      onChange={(e) => setForm({ ...form, acquisitionCost: e.target.value })}
                      required className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="0.00" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">净残值率（%）</label>
                    <input type="number" min="0" max="100" step="0.1" value={form.residualRate}
                      onChange={(e) => setForm({ ...form, residualRate: e.target.value })}
                      className="w-full rounded-md border px-3 py-1.5 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">使用年限（月）</label>
                    <input type="number" min="1" value={form.usefulLifeMonths}
                      onChange={(e) => setForm({ ...form, usefulLifeMonths: e.target.value })}
                      className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="60" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">折旧方法</label>
                    <select value={form.depreciationMethod}
                      onChange={(e) => setForm({ ...form, depreciationMethod: e.target.value })}
                      className="w-full rounded-md border px-3 py-1.5 text-sm">
                      {DEP_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                  </div>
                  {form.depreciationMethod === "USAGE_BASED" && (
                    <div>
                      <label className="block text-sm font-medium mb-1">预计总工作量</label>
                      <input type="number" min="0" value={form.totalWorkload}
                        onChange={(e) => setForm({ ...form, totalWorkload: e.target.value })}
                        className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="如：100000（公里/小时）" />
                    </div>
                  )}
                </div>

                {form.depreciationMethod === "STRAIGHT_LINE" && form.acquisitionCost && (
                  <p className="text-sm text-muted-foreground mt-2 bg-muted/30 rounded px-3 py-1.5">
                    月折旧额预计：¥{monthlyDep}
                  </p>
                )}
              </div>

              {/* Account links */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold mb-3">关联科目（可选）</p>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: "costAccountId" as const, label: "固定资产原值科目" },
                    { key: "accDepAccountId" as const, label: "累计折旧科目" },
                    { key: "depExpAccountId" as const, label: "折旧费用科目" },
                  ].map((f) => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium mb-1">{f.label}</label>
                      <select value={form[f.key]} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                        className="w-full rounded-md border px-3 py-1.5 text-sm">
                        <option value="">— 不关联 —</option>
                        {leafAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} {a.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full rounded-md border px-3 py-1.5 text-sm" />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setOpen(false)}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-muted">取消</button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "保存中..." : (mode === "edit" ? "保存修改" : "创建资产")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
