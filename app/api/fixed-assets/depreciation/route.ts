import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";

/**
 * Calculate monthly depreciation for one asset.
 * Returns 0 if already fully depreciated or disposed.
 */
function calcMonthlyDep(
  acquisitionCost: number,
  residualRate: number,
  usefulLifeMonths: number,
  method: string,
  accumulatedDepreciation: number,
  totalWorkload?: number | null,
  periodWorkload?: number,
): number {
  const residualValue = acquisitionCost * residualRate;
  const depreciableAmount = acquisitionCost - residualValue;
  const bookValue = acquisitionCost - accumulatedDepreciation;
  const monthsUsed = Math.round((accumulatedDepreciation / (depreciableAmount || 1)) * usefulLifeMonths);
  const remainingMonths = Math.max(usefulLifeMonths - monthsUsed, 0);

  // Already fully depreciated
  if (bookValue <= residualValue + 0.005) return 0;

  switch (method) {
    case "STRAIGHT_LINE": {
      return +(depreciableAmount / usefulLifeMonths).toFixed(2);
    }

    case "DECLINING_BALANCE": {
      const annualRate = 2 / (usefulLifeMonths / 12);
      // Switch to straight-line in the last 2 years
      if (remainingMonths <= 24) {
        const straight = (bookValue - residualValue) / Math.max(remainingMonths, 1);
        return +straight.toFixed(2);
      }
      return +(bookValue * (annualRate / 12)).toFixed(2);
    }

    case "SUM_OF_YEARS": {
      const years = usefulLifeMonths / 12;
      const sumOfYears = (years * (years + 1)) / 2;
      const yearUsed = Math.floor(monthsUsed / 12);
      const remainingYears = years - yearUsed;
      const annualRate = remainingYears / sumOfYears;
      return +(depreciableAmount * annualRate / 12).toFixed(2);
    }

    case "USAGE_BASED": {
      if (!totalWorkload || !periodWorkload) return 0;
      const unitDep = depreciableAmount / totalWorkload;
      return +(unitDep * periodWorkload).toFixed(2);
    }

    default:
      return +(depreciableAmount / usefulLifeMonths).toFixed(2);
  }
}

// POST /api/fixed-assets/depreciation
// Body: { companyId, fiscalPeriodId, workloads?: { assetId: string, workload: number }[] }
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const body = await req.json() as {
    companyId: string;
    fiscalPeriodId: string;
    workloads?: { assetId: string; workload: number }[];
  };
  const { companyId, fiscalPeriodId } = body;
  const workloads = body.workloads ?? [];

  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { organizationId: true, name: true },
  });
  if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });

  const member = await db.organizationMember.findFirst({
    where: { organizationId: company.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const period = await db.fiscalPeriod.findUnique({
    where: { id: fiscalPeriodId },
    select: { id: true, name: true, startDate: true, endDate: true, status: true },
  });
  if (!period) return NextResponse.json({ error: "期间不存在" }, { status: 404 });
  if (period.status === "CLOSED") return NextResponse.json({ error: "期间已关闭" }, { status: 400 });

  // Check if depreciation already run for this period
  const existingCount = await db.depreciationRecord.count({
    where: { fiscalPeriod: { id: fiscalPeriodId }, asset: { companyId } },
  });
  if (existingCount > 0) {
    return NextResponse.json({ error: `本期已计提折旧 ${existingCount} 条，不可重复执行。如需修改请先删除本期折旧记录。` }, { status: 400 });
  }

  // Load active assets with their account info
  const assets = await db.fixedAsset.findMany({
    where: {
      companyId,
      status: { in: ["ACTIVE", "IDLE"] },
    },
    select: {
      id: true,
      assetNumber: true,
      name: true,
      acquisitionDate: true,
      acquisitionCost: true,
      residualRate: true,
      usefulLifeMonths: true,
      depreciationMethod: true,
      totalWorkload: true,
      accumulatedDepreciation: true,
      depExpAccountId: true,
      accDepAccountId: true,
    },
  });

  if (assets.length === 0) {
    return NextResponse.json({ error: "无在用固定资产" }, { status: 400 });
  }

  // Assets added in this period (acquisition month = period month) skip depreciation this period
  const periodYear = period.startDate.getFullYear();
  const periodMonth = period.startDate.getMonth(); // 0-based

  // Find default depreciation expense account (6601 管理费用, fallback)
  const defaultDepExpAccount = await db.chartOfAccount.findFirst({
    where: { companyId, code: "6601", isActive: true },
    select: { id: true },
  });
  const defaultAccDepAccount = await db.chartOfAccount.findFirst({
    where: { companyId, code: "1602", isActive: true },
    select: { id: true },
  });

  type LineInput = {
    accountId: string;
    description: string;
    debit: number;
    credit: number;
  };

  const depLines: { assetId: string; assetName: string; amount: number; depExpAccountId: string; accDepAccountId: string }[] = [];

  for (const asset of assets) {
    // Skip if acquired in current period month (按次月起折旧)
    const acqYear = asset.acquisitionDate.getFullYear();
    const acqMonth = asset.acquisitionDate.getMonth();
    if (acqYear === periodYear && acqMonth === periodMonth) continue;

    const cost = Number(asset.acquisitionCost);
    const residualRate = Number(asset.residualRate);
    const accDep = Number(asset.accumulatedDepreciation);
    const workloadEntry = workloads.find((w) => w.assetId === asset.id);
    const periodWorkload = workloadEntry?.workload;

    const monthlyDep = calcMonthlyDep(
      cost, residualRate, asset.usefulLifeMonths,
      asset.depreciationMethod, accDep,
      asset.totalWorkload ? Number(asset.totalWorkload) : null,
      periodWorkload,
    );

    if (monthlyDep <= 0) continue;

    // Ensure we don't over-depreciate past residual value
    const residualValue = cost * residualRate;
    const remaining = cost - accDep - residualValue;
    const finalDep = +Math.min(monthlyDep, Math.max(remaining, 0)).toFixed(2);
    if (finalDep <= 0) continue;

    const depExpId = asset.depExpAccountId ?? defaultDepExpAccount?.id;
    const accDepId = asset.accDepAccountId ?? defaultAccDepAccount?.id;

    if (!depExpId || !accDepId) continue; // skip if no accounts configured

    depLines.push({
      assetId: asset.id,
      assetName: `${asset.assetNumber} ${asset.name}`,
      amount: finalDep,
      depExpAccountId: depExpId,
      accDepAccountId: accDepId,
    });
  }

  if (depLines.length === 0) {
    return NextResponse.json({ error: "本期无需计提折旧（所有资产均已足额或本期新增）" }, { status: 400 });
  }

  // Build journal entry lines — group by expense account
  const expenseMap = new Map<string, number>();
  let totalDepAmount = 0;
  for (const l of depLines) {
    expenseMap.set(l.depExpAccountId, (expenseMap.get(l.depExpAccountId) ?? 0) + l.amount);
    totalDepAmount += l.amount;
  }
  totalDepAmount = +totalDepAmount.toFixed(2);

  // Find acc dep account for credit line (use most common or default)
  const accDepAccountId = depLines[0]!.accDepAccountId;

  const jeLines: LineInput[] = [];
  for (const [accountId, amount] of expenseMap.entries()) {
    jeLines.push({ accountId, description: `计提固定资产折旧（${period.name}）`, debit: +amount.toFixed(2), credit: 0 });
  }
  jeLines.push({ accountId: accDepAccountId, description: `累计折旧（${period.name}，共${depLines.length}项）`, debit: 0, credit: totalDepAmount });

  // Generate entry number
  const year = period.startDate.getFullYear();
  const lastEntry = await db.journalEntry.findFirst({
    where: { companyId, entryNumber: { startsWith: `JE-${year}-` } },
    orderBy: { entryNumber: "desc" },
    select: { entryNumber: true },
  });
  let nextSeq = 1;
  if (lastEntry) {
    const parts = lastEntry.entryNumber.split("-");
    nextSeq = parseInt(parts[2] ?? "0", 10) + 1;
  }
  const entryNumber = `JE-${year}-${String(nextSeq).padStart(5, "0")}`;
  const userId = session.user!.id as string;

  const result = await db.$transaction(async (tx) => {
    // Create journal entry
    const je = await tx.journalEntry.create({
      data: {
        companyId,
        fiscalPeriodId,
        entryNumber,
        entryDate: period.endDate,
        description: `固定资产折旧凭证（${period.name}，共${depLines.length}项）`,
        status: "DRAFT",
        totalDebit: totalDepAmount,
        totalCredit: totalDepAmount,
        createdById: userId,
        lines: {
          create: jeLines.map((l, i) => ({
            lineNumber: i + 1,
            accountId: l.accountId,
            description: l.description,
            debitAmount: l.debit,
            creditAmount: l.credit,
            currency: "CNY",
            exchangeRate: 1,
            functionalDebit: l.debit,
            functionalCredit: l.credit,
          })),
        },
      },
      select: { id: true, entryNumber: true },
    });

    // Create depreciation records and update accumulated depreciation
    for (const dep of depLines) {
      await tx.depreciationRecord.create({
        data: {
          assetId: dep.assetId,
          fiscalPeriodId,
          amount: dep.amount,
          journalEntryId: je.id,
        },
      });
      await tx.fixedAsset.update({
        where: { id: dep.assetId },
        data: {
          accumulatedDepreciation: {
            increment: new Decimal(dep.amount),
          },
        },
      });
    }

    // Check and mark fully-depreciated assets
    const updatedAssets = await tx.fixedAsset.findMany({
      where: { id: { in: depLines.map((d) => d.assetId) } },
      select: { id: true, acquisitionCost: true, residualRate: true, accumulatedDepreciation: true },
    });
    for (const a of updatedAssets) {
      const cost = Number(a.acquisitionCost);
      const residual = cost * Number(a.residualRate);
      const accumulated = Number(a.accumulatedDepreciation);
      if (accumulated >= cost - residual - 0.005) {
        await tx.fixedAsset.update({
          where: { id: a.id },
          data: { status: "FULLY_DEPRECIATED" },
        });
      }
    }

    await tx.auditLog.create({
      data: {
        companyId,
        userId,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: je.id,
        description: `批量计提折旧 ${je.entryNumber}，共 ${depLines.length} 项，合计 ¥${totalDepAmount.toFixed(2)}`,
      },
    });

    return je;
  });

  return NextResponse.json({
    success: true,
    entryId: result.id,
    entryNumber: result.entryNumber,
    assetCount: depLines.length,
    totalDepreciation: totalDepAmount,
    details: depLines.map((d) => ({ assetName: d.assetName, amount: d.amount })),
  });
}
