"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  currency: string;
  outstanding: number;
}

export function ARPaymentActions({ invoiceId, invoiceNumber, currency, outstanding }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    amount: outstanding.toFixed(2),
    matchedDate: today,
    notes: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount <= 0) {
      setError("请输入有效的收款金额");
      return;
    }
    if (amount > outstanding + 0.001) {
      setError(`收款金额不能超过未收款余额 ${outstanding.toFixed(2)}`);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ar-invoices/${invoiceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "record_payment",
          amount,
          matchedDate: form.matchedDate,
          notes: form.notes || undefined,
        }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "登记失败，请重试");
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        登记收款
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">登记收款</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                发票 {invoiceNumber} · 未收款余额：{currency} {outstanding.toFixed(2)}
              </p>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  收款金额（{currency}）<span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  max={outstanding}
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  required
                  className="w-full rounded-md border px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  收款日期 <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.matchedDate}
                  onChange={(e) => setForm({ ...form, matchedDate: e.target.value })}
                  required
                  className="w-full rounded-md border px-3 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">备注</label>
                <input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="如：银行转账，参考号 TRF-001"
                  className="w-full rounded-md border px-3 py-1.5 text-sm"
                />
              </div>
              <div className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700">
                登记收款后，将自动更新发票已收金额及状态。
                建议同时在日记账中创建收款凭证（借：银行存款，贷：应收账款）。
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <button
                  type="button"
                  onClick={() => { setOpen(false); setError(""); }}
                  className="px-4 py-2 text-sm border rounded-md hover:bg-muted"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "保存中..." : "确认登记"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
