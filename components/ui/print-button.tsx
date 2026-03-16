"use client";

export function PrintButton({ label = "打印" }: { label?: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="no-print rounded-md border px-4 py-2 text-sm hover:bg-muted"
    >
      {label}
    </button>
  );
}
