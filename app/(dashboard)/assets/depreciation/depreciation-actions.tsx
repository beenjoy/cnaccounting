"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  companyId: string;
  fiscalPeriodId: string;
  periodName: string;
  assetCount: number;
  totalAmount: number;
}

export function DepreciationActions({ companyId, fiscalPeriodId, periodName, assetCount, totalAmount }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ entryNumber: string; entryId: string } | null>(null);
  const [error, setError] = useState("");

  const fmt = (n: number) =>
    new Intl.NumberFormat("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  async function handleRun() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/fixed-assets/depreciation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, fiscalPeriodId }),
      });
      const data = await res.json() as {
        error?: string;
        entryNumber?: string;
        entryId?: string;
        assetCount?: number;
        totalDepreciation?: number;
      };
      if (!res.ok) { setError(data.error ?? "计提失败"); return; }
      setResult({ entryNumber: data.entryNumber!, entryId: data.entryId! });
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-md px-4 py-3">
        <span className="text-green-600">✓</span>
        <span className="text-sm text-green-700">
          折旧计提成功！已生成凭证 <strong>{result.entryNumber}</strong>（草稿）
        </span>
        <a href={`/journals/${result.entryId}`} className="ml-auto text-sm text-primary hover:underline">
          查看凭证 →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-2">{error}</p>
      )}
      <button onClick={handleRun} disabled={loading || assetCount === 0}
        className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {loading ? "计提中..." : `执行 ${periodName} 折旧计提（${assetCount} 项，¥${fmt(totalAmount)}）`}
      </button>
    </div>
  );
}
