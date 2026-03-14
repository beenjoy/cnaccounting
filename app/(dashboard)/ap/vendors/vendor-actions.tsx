"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type PaymentTerms = "NET_30" | "NET_60" | "NET_90" | "IMMEDIATE" | "CUSTOM";

interface Vendor {
  id: string;
  code: string;
  name: string;
  taxId: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  paymentTerms: PaymentTerms;
  bankAccount: string | null;
  bankName: string | null;
  notes: string | null;
}

interface Props {
  companyId: string;
  mode: "new" | "edit" | "delete";
  vendor?: Vendor;
}

const PAYMENT_OPTIONS: { value: PaymentTerms; label: string }[] = [
  { value: "NET_30", label: "Net 30天" },
  { value: "NET_60", label: "Net 60天" },
  { value: "NET_90", label: "Net 90天" },
  { value: "IMMEDIATE", label: "即期" },
  { value: "CUSTOM", label: "自定义" },
];

export function VendorActions({ companyId, mode, vendor }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    code: vendor?.code ?? "",
    name: vendor?.name ?? "",
    taxId: vendor?.taxId ?? "",
    contactName: vendor?.contactName ?? "",
    phone: vendor?.phone ?? "",
    email: vendor?.email ?? "",
    address: vendor?.address ?? "",
    currency: vendor?.currency ?? "CNY",
    paymentTerms: vendor?.paymentTerms ?? "NET_30" as PaymentTerms,
    bankAccount: vendor?.bankAccount ?? "",
    bankName: vendor?.bankName ?? "",
    notes: vendor?.notes ?? "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const url = mode === "edit" ? `/api/vendors/${vendor!.id}` : "/api/vendors";
      const method = mode === "edit" ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, ...form }),
      });
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
      const res = await fetch(`/api/vendors/${vendor!.id}`, { method: "DELETE" });
      if (res.ok) { setOpen(false); router.refresh(); }
    } finally {
      setLoading(false);
    }
  }

  if (mode === "delete") {
    return (
      <>
        <button onClick={() => setOpen(true)} className="text-xs text-red-500 hover:text-red-700">停用</button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 w-80">
              <h3 className="text-base font-semibold mb-2">确认停用</h3>
              <p className="text-sm text-muted-foreground mb-4">将供应商「{vendor?.name}」置为停用状态，历史发票不受影响。</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">取消</button>
                <button onClick={handleDelete} disabled={loading} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                  {loading ? "处理中..." : "确认停用"}
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
      <button
        onClick={() => setOpen(true)}
        className={mode === "new"
          ? "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          : "text-xs text-primary hover:underline"
        }
      >
        {mode === "new" ? "新建供应商" : "编辑"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">{mode === "new" ? "新建供应商" : "编辑供应商"}</h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">供应商编码 <span className="text-red-500">*</span></label>
                  <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                    disabled={mode === "edit"} required className="w-full rounded-md border px-3 py-1.5 text-sm disabled:bg-muted" placeholder="如：V001" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">供应商名称 <span className="text-red-500">*</span></label>
                  <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">税号</label>
                  <input value={form.taxId} onChange={(e) => setForm({ ...form, taxId: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">联系人</label>
                  <input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">电话</label>
                  <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">付款条件</label>
                  <select value={form.paymentTerms} onChange={(e) => setForm({ ...form, paymentTerms: e.target.value as PaymentTerms })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm">
                    {PAYMENT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">开户行</label>
                  <input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">银行账号</label>
                  <input value={form.bankAccount} onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full rounded-md border px-3 py-1.5 text-sm" />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">取消</button>
                <button type="submit" disabled={loading} className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
                  {loading ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
