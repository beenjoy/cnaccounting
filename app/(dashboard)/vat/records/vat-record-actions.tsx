"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Period { id: string; name: string; }

interface Props {
  companyId: string;
  periods: Period[];
  mode?: "new" | "delete";
  recordId?: string;
}

const INVOICE_TYPES = [
  { value: "SPECIAL_VAT",    label: "增值税专用发票" },
  { value: "GENERAL_VAT",    label: "增值税普通发票" },
  { value: "ELECTRONIC_VAT", label: "电子普通发票" },
  { value: "TOLL_ROAD",      label: "通行费发票" },
  { value: "OTHER",          label: "其他" },
];

const TAX_RATES = [
  { value: "0.13", label: "13%" },
  { value: "0.09", label: "9%" },
  { value: "0.06", label: "6%" },
  { value: "0.05", label: "5%" },
  { value: "0.03", label: "3%" },
  { value: "0.01", label: "1%" },
  { value: "0",    label: "0% (免税)" },
];

export function VATRecordActions({ companyId, periods, mode = "new", recordId }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    direction: "SALES",
    invoiceType: "SPECIAL_VAT",
    invoiceNumber: "",
    invoiceDate: today,
    counterparty: "",
    counterpartyTaxId: "",
    amount: "",
    taxRate: "0.13",
    taxAmount: "",
    deductible: true,
    fiscalPeriodId: periods[0]?.id ?? "",
    notes: "",
  });

  // Auto-calculate tax amount when amount or taxRate changes
  function calcTax(amount: string, taxRate: string) {
    const a = parseFloat(amount);
    const r = parseFloat(taxRate);
    if (isNaN(a) || isNaN(r)) return "";
    return (a * r).toFixed(2);
  }

  function handleAmountChange(v: string) {
    setForm((f) => ({
      ...f,
      amount: v,
      taxAmount: calcTax(v, f.taxRate),
    }));
  }

  function handleRateChange(v: string) {
    setForm((f) => ({
      ...f,
      taxRate: v,
      taxAmount: calcTax(f.amount, v),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/vat-records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          direction: form.direction,
          invoiceType: form.invoiceType,
          invoiceNumber: form.invoiceNumber,
          invoiceDate: form.invoiceDate,
          counterparty: form.counterparty,
          counterpartyTaxId: form.counterpartyTaxId || null,
          amount: parseFloat(form.amount) || 0,
          taxRate: parseFloat(form.taxRate),
          taxAmount: parseFloat(form.taxAmount) || 0,
          deductible: form.direction === "SALES" ? false : form.deductible,
          fiscalPeriodId: form.fiscalPeriodId || null,
          notes: form.notes || null,
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

  async function handleDelete() {
    setLoading(true);
    try {
      const res = await fetch(`/api/vat-records/${recordId}`, { method: "DELETE" });
      if (res.ok) { setOpen(false); router.refresh(); }
    } finally {
      setLoading(false);
    }
  }

  if (mode === "delete") {
    return (
      <>
        <button onClick={() => setOpen(true)} className="text-xs text-red-500 hover:text-red-700">删除</button>
        {open && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl p-6 w-80">
              <h3 className="text-base font-semibold mb-2">确认删除</h3>
              <p className="text-sm text-muted-foreground mb-4">删除此增值税记录后不可恢复。</p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-sm border rounded-md hover:bg-muted">取消</button>
                <button onClick={handleDelete} disabled={loading} className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50">
                  {loading ? "处理中..." : "确认删除"}
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
        新建记录
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">新建增值税记录</h2>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">

              {/* Direction */}
              <div>
                <label className="block text-sm font-medium mb-1">方向 <span className="text-red-500">*</span></label>
                <div className="flex gap-4">
                  {[{ value: "SALES", label: "销项（开出发票）" }, { value: "PURCHASE", label: "进项（收到发票）" }].map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="direction" value={opt.value}
                        checked={form.direction === opt.value}
                        onChange={(e) => setForm({ ...form, direction: e.target.value })} />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Invoice type + number */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">发票类型</label>
                  <select value={form.invoiceType}
                    onChange={(e) => setForm({ ...form, invoiceType: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm">
                    {INVOICE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">发票号 <span className="text-red-500">*</span></label>
                  <input value={form.invoiceNumber}
                    onChange={(e) => setForm({ ...form, invoiceNumber: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm"
                    placeholder="如：01234567" />
                </div>
              </div>

              {/* Date + Period */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">开票日期 <span className="text-red-500">*</span></label>
                  <input type="date" value={form.invoiceDate}
                    onChange={(e) => setForm({ ...form, invoiceDate: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">会计期间</label>
                  <select value={form.fiscalPeriodId}
                    onChange={(e) => setForm({ ...form, fiscalPeriodId: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm">
                    <option value="">不关联期间</option>
                    {periods.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Counterparty */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">对方名称 <span className="text-red-500">*</span></label>
                  <input value={form.counterparty}
                    onChange={(e) => setForm({ ...form, counterparty: e.target.value })}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm"
                    placeholder="开票方/受票方名称" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">税号</label>
                  <input value={form.counterpartyTaxId}
                    onChange={(e) => setForm({ ...form, counterpartyTaxId: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm"
                    placeholder="统一社会信用代码" />
                </div>
              </div>

              {/* Amount + Tax Rate + Tax Amount */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">不含税金额 <span className="text-red-500">*</span></label>
                  <input type="number" min="0" step="0.01" value={form.amount}
                    onChange={(e) => handleAmountChange(e.target.value)}
                    required className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">税率</label>
                  <select value={form.taxRate} onChange={(e) => handleRateChange(e.target.value)}
                    className="w-full rounded-md border px-3 py-1.5 text-sm">
                    {TAX_RATES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">税额</label>
                  <input type="number" min="0" step="0.01" value={form.taxAmount}
                    onChange={(e) => setForm({ ...form, taxAmount: e.target.value })}
                    className="w-full rounded-md border px-3 py-1.5 text-sm" />
                </div>
              </div>

              {form.amount && (
                <p className="text-sm text-muted-foreground">
                  价税合计：¥{((parseFloat(form.amount) || 0) + (parseFloat(form.taxAmount) || 0)).toFixed(2)}
                </p>
              )}

              {/* Deductible (purchase only) */}
              {form.direction === "PURCHASE" && (
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="deductible" checked={form.deductible}
                    onChange={(e) => setForm({ ...form, deductible: e.target.checked })}
                    className="rounded" />
                  <label htmlFor="deductible" className="text-sm">可抵扣进项税（已认证）</label>
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <textarea value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2} className="w-full rounded-md border px-3 py-1.5 text-sm" />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-2 border-t">
                <button type="button" onClick={() => setOpen(false)} className="px-4 py-2 text-sm border rounded-md hover:bg-muted">取消</button>
                <button type="submit" disabled={loading}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50">
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
