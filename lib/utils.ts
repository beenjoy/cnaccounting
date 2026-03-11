import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";
import Decimal from "decimal.js";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return format(new Date(date), "yyyy-MM-dd");
}

export function formatDateTime(date: Date | string | null): string {
  if (!date) return "-";
  return format(new Date(date), "yyyy-MM-dd HH:mm");
}

export function formatAmount(amount: Decimal | number | string | null, decimals = 2): string {
  if (amount === null || amount === undefined) return "-";
  const num = new Decimal(amount.toString());
  return num.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\u4e00-\u9fa5]/g, (char) => {
      const pinyin: Record<string, string> = {};
      return pinyin[char] || char;
    })
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50) || `org-${Date.now()}`;
}

export function generateEntryNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${String(sequence).padStart(5, "0")}`;
}

// 校验借贷是否平衡
export function isBalanced(
  lines: Array<{ debitAmount: number | string; creditAmount: number | string }>
): boolean {
  const totalDebit = lines.reduce(
    (sum, l) => sum.plus(new Decimal(l.debitAmount.toString())),
    new Decimal(0)
  );
  const totalCredit = lines.reduce(
    (sum, l) => sum.plus(new Decimal(l.creditAmount.toString())),
    new Decimal(0)
  );
  return totalDebit.equals(totalCredit);
}
