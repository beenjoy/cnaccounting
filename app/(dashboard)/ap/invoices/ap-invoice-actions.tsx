"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Vendor { id: string; code: string; name: string; }
interface Invoice { id: string; invoiceNumber: string; status: string; }

interface Props {
  companyId: string;
  vendors: Vendor[];
  mode: "new" | "cancel";
  invoice?: Invoice;
}

export function APInvoiceActions({ companyId, vendors, mode, invoice }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const thirtyDaysLater = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    vendorId: vendors[0]?.id ?? "",
    invoiceNumber: "",
    invoiceDate: today,
    dueDate: thirtyDaysLater,
    currency: "CNY",
    subtotal: "",
    taxAmount: "",
    description: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ap-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          vendorId: form.vendorId,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          dueDate: form.dueDate,
          currency: form.currency,
          subtotal: parseFloat(form.subtotal) || 0,
          taxAmount: parseFloat(form.taxAmount) || 0,
          description: form.description,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? "创建失败"); return; }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    setLoading(true);
    try {
      const res = await fetch(`/api/ap-invoices/${invoice!.id}`, { method: "DELETE" });
      if (res.ok) { setOpen(false); router.refresh(); }
    } finally {
      setLoading(false);
    }
  }

  if (mode === "cancel") {
    return (
      <>
        <button onClick={() => setOpen(true)} className="text-xs text-red-500 hover:text-red-700">作废</button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 w-80">
              <h3 className="text-base font-semibold mb-2">确认作废</h3>
              <p className="text-sm text-muted-foreground mb-4">将发票「{invoice?.invoiceNumber}」作废，此操作不可恢复。</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">取消</button>
                <button onClick={handleCancel} disabled={loading} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                  {loading ? "处理中..." : "确认作废"}
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
        新建发票
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">新建应付发票</h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">供应商 <span className="text-red-500">*</span></label>
                <select value={form.vendorId} onChange={(e) => setForm({ ...form, vendorId: e.target.value })}
                  required className="w-full rounded-md border px-3 py-1.5 text-sm">
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>{v.code} {v.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">发票号 <span className="text-red-500">*</span></label>
                  <input value={form.invoiceNumber} onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" placeholder="如：PO-2026-001" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">币种</label>
                  <input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" maxLength={3} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">开票日期 <span className="text-red-500">*</span></label>
                  <input type="date" value={form.invoiceDate} onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">到期日 <span className="text-red-500">*</span></label>
                  <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">不含税金额 <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" value={form.subtotal}
                    onChange={(e) => setForm({ ...form, subtotal: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">税额</label>
                  <input type="number" min="0" step="0.01" value={form.taxAmount}
                    onChange={(e) => setForm({ ...form, taxAmount: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
              </div>

              {form.subtotal && (
                <p className="text-sm text-muted-foreground">
                  含税总额：¥{((parseFloat(form.subtotal) || 0) + (parseFloat(form.taxAmount) || 0)).toFixed(2)}
                </p>
              )}

              <div>
                <label className="block text-sm font-medium mb-1">摘要</label>
                <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
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
