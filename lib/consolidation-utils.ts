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

/* ═══════════════════════════════════════════════════════════════════════
   NCI & INVESTMENT ELIMINATION  (CAS 33《合并财务报表》)
   ═══════════════════════════════════════════════════════════════════════

   计算少数股东权益（NCI）与长期股权投资抵消，供合并资产负债表和利润表使用。

   核心逻辑：
   1. NCI权益  = 子公司净资产（EQUITY科目贷方净额）× (1 - 持股比例)
   2. NCI利润  = 子公司当期净利润 × (1 - 持股比例)
   3. 投资抵消 = 母公司长期股权投资余额（借方正常）vs. 子公司权益×持股比例
   4. 商誉     = max(0, 母公司投资 - 子公司权益×持股比例)

   合并资产负债表平衡检验：
     调整后资产 = 加总资产 - Σ母公司投资 + Σ商誉
     权益分配：归属母公司 = 加总权益 - Σ子公司权益；少数股东 = Σ NCI权益
     调整后资产 = 负债 + 归属母公司权益 + 少数股东权益  ✓
   ═══════════════════════════════════════════════════════════════════════ */

export interface NCIEliminationDetail {
  memberId:         string;
  subsidiaryName:   string;
  ownershipPct:     number;
  /** 子公司所有者权益合计（累计，贷方正常） */
  subsidiaryEquity: number;
  /** NCI 在权益中的份额 = subsidiaryEquity × (1 - ownershipPct) */
  nciEquity:        number;
  /** 母公司对该子公司的长期股权投资余额（借方正常）；未配置 investmentAccountCode 时为 null */
  parentInvestment: number | null;
  /** 商誉 = max(0, parentInvestment - subsidiaryEquity × ownershipPct)；null 表示无投资数据 */
  goodwill:         number | null;
}

export interface NCIEliminationResult {
  /** 少数股东权益合计（在合并 BS 权益区单独列示） */
  nciEquityTotal:    number;
  /** 少数股东本期损益 */
  nciProfitPeriod:   number;
  /** 少数股东累计损益（1月至当月） */
  nciProfitYtd:      number;
  /** 需从合并资产中抵消的母公司投资余额合计 */
  eliminatedAssets:  number;
  /** 需从合并权益中抵消的子公司权益合计（全部子公司权益之和，含NCI部分） */
  eliminatedEquity:  number;
  /** 商誉合计（计入非流动资产） */
  goodwillTotal:     number;
  /** 是否有任何子公司配置了 investmentAccountCode */
  hasInvestmentData: boolean;
  details:           NCIEliminationDetail[];
}

/**
 * 计算单个公司的所有者权益总额（累计至 month 月末）。
 * 权益科目（accountType=EQUITY）贷方正常余额 = Σ creditAmountLC - Σ debitAmountLC
 */
async function computeCompanyEquityBalance(
  companyId: string,
  year:      number,
  month:     number,  // 1-12
): Promise<number> {
  const periods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId, year },
      periodNumber: { lte: month },
    },
    select: { id: true },
  });
  if (periods.length === 0) return 0;

  const agg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: {
        companyId,
        fiscalPeriodId: { in: periods.map((p) => p.id) },
        status: "POSTED",
      },
      account: { accountType: "EQUITY" },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });

  const debit  = parseFloat((agg._sum.debitAmountLC  ?? 0).toString());
  const credit = parseFloat((agg._sum.creditAmountLC ?? 0).toString());
  return credit - debit;  // 贷方正常余额为正
}

/**
 * 计算单个公司的净利润。
 * periodOnly=true  → 仅本月（用于利润表"本期"列）
 * periodOnly=false → 累计至 month 月（用于利润表"累计"列）
 *
 * 净利润 = Σ(REVENUE 贷方净额) - Σ(EXPENSE 借方净额)
 */
async function computeCompanyProfit(
  companyId:  string,
  year:       number,
  month:      number,
  periodOnly: boolean,
): Promise<number> {
  const periods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId, year },
      periodNumber: periodOnly ? month : { lte: month },
    },
    select: { id: true },
  });
  if (periods.length === 0) return 0;

  const periodIds = periods.map((p) => p.id);

  // Revenue: 贷方正常，余额 = credit - debit
  const revAgg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: { companyId, fiscalPeriodId: { in: periodIds }, status: "POSTED" },
      account: { accountType: "REVENUE" },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });
  const revDebit  = parseFloat((revAgg._sum.debitAmountLC  ?? 0).toString());
  const revCredit = parseFloat((revAgg._sum.creditAmountLC ?? 0).toString());
  const revenue = revCredit - revDebit;

  // Expense: 借方正常，余额 = debit - credit
  const expAgg = await db.journalEntryLine.aggregate({
    where: {
      journalEntry: { companyId, fiscalPeriodId: { in: periodIds }, status: "POSTED" },
      account: { accountType: "EXPENSE" },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });
  const expDebit  = parseFloat((expAgg._sum.debitAmountLC  ?? 0).toString());
  const expCredit = parseFloat((expAgg._sum.creditAmountLC ?? 0).toString());
  const expense = expDebit - expCredit;

  return revenue - expense;
}

/**
 * 计算母公司对特定子公司的长期股权投资余额（累计）。
 * 长期股权投资科目借方正常余额 = Σ debitAmountLC - Σ creditAmountLC
 * 若未找到该科目，返回 null。
 */
async function computeParentInvestmentBalance(
  parentCompanyId:  string,
  accountCode:      string,
  year:             number,
  month:            number,
): Promise<number | null> {
  const account = await db.chartOfAccount.findFirst({
    where: { companyId: parentCompanyId, code: accountCode },
    select: { id: true },
  });
  if (!account) return null;

  const periods = await db.fiscalPeriod.findMany({
    where: {
      fiscalYear: { companyId: parentCompanyId, year },
      periodNumber: { lte: month },
    },
    select: { id: true },
  });
  if (periods.length === 0) return null;

  const agg = await db.journalEntryLine.aggregate({
    where: {
      accountId: account.id,
      journalEntry: {
        companyId: parentCompanyId,
        fiscalPeriodId: { in: periods.map((p) => p.id) },
        status: "POSTED",
      },
    },
    _sum: { debitAmountLC: true, creditAmountLC: true },
  });

  const debit  = parseFloat((agg._sum.debitAmountLC  ?? 0).toString());
  const credit = parseFloat((agg._sum.creditAmountLC ?? 0).toString());
  return debit - credit;  // 借方正常余额
}

/**
 * 主函数：计算合并报表所需的 NCI 和投资抵消数据。
 *
 * 仅处理 consolidationMethod=FULL（或 memberType=PARENT）的成员。
 * 对于持股比例 = 100% 的子公司，NCI 为零，仍执行投资抵消。
 *
 * @param members - 合并范围内所有成员（含母公司和子公司）
 * @param year    - 报告年度
 * @param month   - 报告截止月份（1-12）
 */
export async function computeNCIAndElimination(
  members: ConsolidationMemberInfo[],
  year:    number,
  month:   number,
): Promise<NCIEliminationResult> {
  const parent = members.find((m) => m.memberType === "PARENT");
  const subsidiaries = members.filter(
    (m) => m.memberType === "SUBSIDIARY" && m.consolidationMethod === "FULL"
  );

  const details: NCIEliminationDetail[] = [];
  let nciEquityTotal  = 0;
  let nciProfitPeriod = 0;
  let nciProfitYtd    = 0;
  let eliminatedAssets = 0;
  let eliminatedEquity = 0;
  let goodwillTotal   = 0;
  let hasInvestmentData = false;

  for (const sub of subsidiaries) {
    const nciPct = 1 - sub.ownershipPct;  // 少数股东持股比例

    // ── 1. 子公司权益（用于 NCI 和投资抵消）──
    const subEquity = await computeCompanyEquityBalance(sub.companyId, year, month);
    const nciEquity = subEquity * nciPct;

    // ── 2. 子公司净利润（用于 NCI 利润分配）──
    const subProfitPeriod = await computeCompanyProfit(sub.companyId, year, month, true);
    const subProfitYtd    = await computeCompanyProfit(sub.companyId, year, month, false);

    // ── 3. 母公司投资余额（若配置了 investmentAccountCode）──
    let parentInvestment: number | null = null;
    let goodwill: number | null = null;

    if (parent && sub.investmentAccountCode) {
      hasInvestmentData = true;
      parentInvestment = await computeParentInvestmentBalance(
        parent.companyId,
        sub.investmentAccountCode,
        year,
        month,
      );
      if (parentInvestment !== null) {
        const proportionateEquity = subEquity * sub.ownershipPct;
        goodwill = Math.max(0, parentInvestment - proportionateEquity);
        eliminatedAssets += parentInvestment;
        goodwillTotal    += goodwill;
      }
    }

    // 子公司全部权益计入抵消（母公司应占份额将被抵消，NCI 份额作为少数股东权益重新列示）
    eliminatedEquity += subEquity;
    nciEquityTotal   += nciEquity;
    nciProfitPeriod  += subProfitPeriod * nciPct;
    nciProfitYtd     += subProfitYtd    * nciPct;

    details.push({
      memberId:         sub.id,
      subsidiaryName:   sub.companyName,
      ownershipPct:     sub.ownershipPct,
      subsidiaryEquity: subEquity,
      nciEquity,
      parentInvestment,
      goodwill,
    });
  }

  return {
    nciEquityTotal,
    nciProfitPeriod,
    nciProfitYtd,
    eliminatedAssets,
    eliminatedEquity,
    goodwillTotal,
    hasInvestmentData,
    details,
  };
}
