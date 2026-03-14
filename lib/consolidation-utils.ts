/**
 * Shared utilities for consolidated financial reports (Phase 6)
 *
 * Strategy: Aggregate JournalEntryLine balances across all member companies
 * grouped by (accountType, reportCategory). This allows combining accounts
 * with the same economic meaning even when account codes differ across companies.
 *
 * Period selection: use calendar date range (startDate … endDate) so we can
 * match a common reporting period (e.g. "2026年1月") across companies with
 * different fiscal period IDs.
 */

import { db } from "@/lib/db";

export interface ConsolidatedAccountBalance {
  accountType: string;       // ASSET / LIABILITY / EQUITY / REVENUE / EXPENSE
  normalBalance: string;     // DEBIT / CREDIT
  reportCategory: string | null;
  /** Signed balance in the normal direction (positive = has a balance) */
  balance: number;
  /** Per-company breakdown */
  byCompany: Record<string, number>;
}

export interface ConsolidationMemberInfo {
  id: string;
  companyId: string;
  companyName: string;
  memberType: string;       // PARENT / SUBSIDIARY
  ownershipPct: number;
  consolidationMethod: string;
  investmentAccountCode: string | null;
}

/**
 * Load group metadata + member info for a consolidation group.
 */
export async function loadGroupInfo(groupId: string) {
  const group = await db.consolidationGroup.findUnique({
    where: { id: groupId },
    include: {
      organization: { select: { id: true } },
      members: {
        include: {
          company: {
            select: { id: true, name: true, code: true, functionalCurrency: true },
          },
        },
        orderBy: [{ memberType: "asc" }, { sortOrder: "asc" }],
      },
    },
  });
  return group;
}

/**
 * For a given calendar year+month, find the fiscal period of each member company
 * that covers that month, and return a map of companyId → periodId.
 */
export async function findPeriodsByYearMonth(
  companyIds: string[],
  year: number,
  month: number // 1-12
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (companyIds.length === 0) return map;

  const periods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: {
        companyId: { in: companyIds },
        year,
      },
      periodNumber: month,
    },
    select: {
      id: true,
      fiscalYear: { select: { companyId: true } },
    },
  });

  for (const p of periods) {
    map.set(p.fiscalYear.companyId, p.id);
  }
  return map;
}

/**
 * Compute CUMULATIVE account balances for a consolidation group as of the
 * end of the specified period (year/month). Balances are summed from the
 * start of each company's fiscal year through the selected period — matching
 * the logic used for individual Balance Sheets.
 *
 * Returns a list aggregated by (accountType, reportCategory).
 */
export async function computeConsolidatedBalances(
  members: ConsolidationMemberInfo[],
  year: number,
  month: number, // 1-12, inclusive
  excludeIntercompany = false
): Promise<ConsolidatedAccountBalance[]> {
  const companyIds = members.map((m) => m.companyId);
  if (companyIds.length === 0) return [];

  // For each company, get all period IDs in [1 .. month] of the given year
  const allPeriods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId: { in: companyIds }, year },
      periodNumber: { lte: month },
    },
    select: {
      id: true,
      periodNumber: true,
      fiscalYear: { select: { companyId: true } },
    },
  });

  const periodIds = allPeriods.map((p) => p.id);
  if (periodIds.length === 0) return [];

  // Query all posted journal lines for those periods
  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        companyId: { in: companyIds },
        fiscalPeriodId: { in: periodIds },
        status: "POSTED",
      },
      ...(excludeIntercompany ? { isIntercompany: false } : {}),
    },
    select: {
      accountId: true,
      debitAmountLC: true,
      creditAmountLC: true,
      isIntercompany: true,
      journalEntry: { select: { companyId: true } },
      account: {
        select: {
          accountType: true,
          normalBalance: true,
          reportCategory: true,
        },
      },
    },
  });

  // Group by (accountType, reportCategory) and sum across companies
  type Key = string; // `${accountType}|${reportCategory}`
  const map = new Map<
    Key,
    {
      accountType: string;
      normalBalance: string;
      reportCategory: string | null;
      totalDebit: number;
      totalCredit: number;
      byCompany: Record<string, { debit: number; credit: number }>;
    }
  >();

  for (const line of lines) {
    const { accountType, normalBalance, reportCategory } = line.account;
    const key = `${accountType}|${reportCategory ?? ""}`;
    const companyId = line.journalEntry.companyId;

    if (!map.has(key)) {
      map.set(key, {
        accountType,
        normalBalance,
        reportCategory: reportCategory ?? null,
        totalDebit: 0,
        totalCredit: 0,
        byCompany: {},
      });
    }
    const entry = map.get(key)!;
    const debit = parseFloat(line.debitAmountLC?.toString() ?? "0");
    const credit = parseFloat(line.creditAmountLC?.toString() ?? "0");
    entry.totalDebit += debit;
    entry.totalCredit += credit;

    if (!entry.byCompany[companyId]) {
      entry.byCompany[companyId] = { debit: 0, credit: 0 };
    }
    entry.byCompany[companyId].debit += debit;
    entry.byCompany[companyId].credit += credit;
  }

  const result: ConsolidatedAccountBalance[] = [];
  for (const entry of map.values()) {
    const balance =
      entry.normalBalance === "DEBIT"
        ? entry.totalDebit - entry.totalCredit
        : entry.totalCredit - entry.totalDebit;

    const byCompanyBalance: Record<string, number> = {};
    for (const [cId, { debit, credit }] of Object.entries(entry.byCompany)) {
      byCompanyBalance[cId] =
        entry.normalBalance === "DEBIT" ? debit - credit : credit - debit;
    }

    result.push({
      accountType: entry.accountType,
      normalBalance: entry.normalBalance,
      reportCategory: entry.reportCategory,
      balance,
      byCompany: byCompanyBalance,
    });
  }

  return result;
}

/**
 * Compute PERIOD-ONLY account balances (for income statement: current period only).
 * Only includes journal lines whose fiscal period falls within the given year+month.
 */
export async function computeConsolidatedPeriodBalances(
  members: ConsolidationMemberInfo[],
  year: number,
  month: number,
  excludeIntercompany = false
): Promise<ConsolidatedAccountBalance[]> {
  const companyIds = members.map((m) => m.companyId);
  if (companyIds.length === 0) return [];

  // Only the single month's periods
  const periods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId: { in: companyIds }, year },
      periodNumber: month,
    },
    select: { id: true, fiscalYear: { select: { companyId: true } } },
  });

  const periodIds = periods.map((p) => p.id);
  if (periodIds.length === 0) return [];

  const lines = await db.journalEntryLine.findMany({
    where: {
      journalEntry: {
        companyId: { in: companyIds },
        fiscalPeriodId: { in: periodIds },
        status: "POSTED",
      },
      ...(excludeIntercompany ? { isIntercompany: false } : {}),
    },
    select: {
      accountId: true,
      debitAmountLC: true,
      creditAmountLC: true,
      isIntercompany: true,
      journalEntry: { select: { companyId: true } },
      account: {
        select: {
          accountType: true,
          normalBalance: true,
          reportCategory: true,
        },
      },
    },
  });

  type Key = string;
  const map = new Map<
    Key,
    {
      accountType: string;
      normalBalance: string;
      reportCategory: string | null;
      totalDebit: number;
      totalCredit: number;
      byCompany: Record<string, { debit: number; credit: number }>;
    }
  >();

  for (const line of lines) {
    const { accountType, normalBalance, reportCategory } = line.account;
    const key = `${accountType}|${reportCategory ?? ""}`;
    const companyId = line.journalEntry.companyId;

    if (!map.has(key)) {
      map.set(key, { accountType, normalBalance, reportCategory: reportCategory ?? null, totalDebit: 0, totalCredit: 0, byCompany: {} });
    }
    const entry = map.get(key)!;
    const debit = parseFloat(line.debitAmountLC?.toString() ?? "0");
    const credit = parseFloat(line.creditAmountLC?.toString() ?? "0");
    entry.totalDebit += debit;
    entry.totalCredit += credit;
    if (!entry.byCompany[companyId]) entry.byCompany[companyId] = { debit: 0, credit: 0 };
    entry.byCompany[companyId].debit += debit;
    entry.byCompany[companyId].credit += credit;
  }

  const result: ConsolidatedAccountBalance[] = [];
  for (const entry of map.values()) {
    const balance = entry.normalBalance === "DEBIT"
      ? entry.totalDebit - entry.totalCredit
      : entry.totalCredit - entry.totalDebit;

    const byCompanyBalance: Record<string, number> = {};
    for (const [cId, { debit, credit }] of Object.entries(entry.byCompany)) {
      byCompanyBalance[cId] = entry.normalBalance === "DEBIT" ? debit - credit : credit - debit;
    }

    result.push({ accountType: entry.accountType, normalBalance: entry.normalBalance, reportCategory: entry.reportCategory, balance, byCompany: byCompanyBalance });
  }

  return result;
}

/** Get available year/month options based on all member companies' fiscal periods */
export async function getAvailablePeriods(companyIds: string[]) {
  if (companyIds.length === 0) return [];

  const years = await db.fiscalYear.findMany({
    where: { companyId: { in: companyIds } },
    select: { year: true },
    distinct: ["year"],
    orderBy: { year: "desc" },
  });

  return years.map((y) => y.year);
}
