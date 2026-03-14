"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  companyId: string;
  fiscalPeriodId: string;
  periodName: string;
  salesTax: number;
  vatPayable: number;
}

export function VATDeclarationActions({ companyId, fiscalPeriodId, periodName, salesTax, vatPayable }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ entryNumber: string; entryId: string } | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/vat-declaration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, fiscalPeriodId }),
      });
      const data = await res.json() as { error?: string; entryNumber?: string; entryId?: string };
      if (!res.ok) {
        setError(data.error ?? "生成失败");
        return;
      }
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
          已成功生成结转凭证 <strong>{result.entryNumber}</strong>（草稿）
        </span>
        <a href={`/journals/${result.entryId}`}
          className="ml-auto text-sm text-primary hover:underline">
          查看凭证 →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {salesTax === 0 && vatPayable === 0 && (
        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-4 py-2">
          本期销项税额为零，无需生成结转凭证
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-4 py-2">
          {error}
        </p>
      )}
      <button
        onClick={handleGenerate}
        disabled={loading || salesTax === 0}
        className="rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "生成中..." : `生成 ${periodName} 增值税结转凭证`}
      </button>
    </div>
  );
}
