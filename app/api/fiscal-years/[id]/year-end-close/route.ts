import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Decimal } from "@prisma/client/runtime/library";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const userId = session.user.id; // guaranteed non-null after check above

  const { id: fiscalYearId } = await params;

  try {
    // ── 1. 获取会计年度及其期间 ──────────────────────────────────────
    const fiscalYear = await db.fiscalYear.findUnique({
      where: { id: fiscalYearId },
      include: {
        company: true,
        periods: { orderBy: { periodNumber: "asc" } },
      },
    });

    if (!fiscalYear) {
      return NextResponse.json({ error: "会计年度不存在" }, { status: 404 });
    }

    // ── 2. 权限校验（OWNER / ADMIN） ─────────────────────────────────
    const membership = await db.organizationMember.findFirst({
      where: {
        userId: userId,
        organizationId: fiscalYear.company.organizationId,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });
    if (!membership) {
      return NextResponse.json({ error: "无权执行年末结账" }, { status: 403 });
    }

    // ── 3. 年度已关闭检查 ─────────────────────────────────────────────
    if (fiscalYear.isClosed) {
      return NextResponse.json({ error: "该年度已完成年末结账" }, { status: 400 });
    }

    // ── 4. 全部期间必须为 CLOSED ──────────────────────────────────────
    const openPeriods = fiscalYear.periods.filter((p) => p.status === "OPEN");
    if (openPeriods.length > 0) {
      return NextResponse.json(
        { error: `尚有 ${openPeriods.length} 个未关闭的会计期间，请先关闭所有期间` },
        { status: 400 }
      );
    }

    const companyId = fiscalYear.companyId;
    const lastPeriod = fiscalYear.periods[fiscalYear.periods.length - 1]; // 第12期
    const yearEndDate = fiscalYear.endDate;

    // ── 5. 汇总全年 POSTED 收入/费用科目余额 ─────────────────────────
    const periodIds = fiscalYear.periods.map((p) => p.id);

    const incomeExpenseLines = await db.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId,
          status: "POSTED",
          fiscalPeriodId: { in: periodIds },
        },
        account: {
          accountType: { in: ["REVENUE", "EXPENSE"] },
        },
      },
      include: {
        account: {
          select: { id: true, code: true, name: true, accountType: true, normalBalance: true },
        },
      },
    });

    // 按科目汇总借贷
    const accountBalanceMap = new Map<
      string,
      { id: string; code: string; name: string; type: string; debit: number; credit: number }
    >();
    for (const line of incomeExpenseLines) {
      const key = line.accountId;
      if (!accountBalanceMap.has(key)) {
        accountBalanceMap.set(key, {
          id: line.account.id,
          code: line.account.code,
          name: line.account.name,
          type: line.account.accountType,
          debit: 0,
          credit: 0,
        });
      }
      const acc = accountBalanceMap.get(key)!;
      acc.debit += parseFloat(line.debitAmountLC.toString());
      acc.credit += parseFloat(line.creditAmountLC.toString());
    }

    // 收入科目净余额（贷方正常）= credit - debit
    // 费用科目净余额（借方正常）= debit - credit
    let totalRevenueNet = 0;
    let totalExpenseNet = 0;
    const revenueEntries: { id: string; name: string; amount: number }[] = [];
    const expenseEntries: { id: string; name: string; amount: number }[] = [];

    for (const [, acc] of accountBalanceMap) {
      if (acc.type === "REVENUE") {
        const net = acc.credit - acc.debit;
        if (net !== 0) {
          revenueEntries.push({ id: acc.id, name: acc.name, amount: net });
          totalRevenueNet += net;
        }
      } else if (acc.type === "EXPENSE") {
        const net = acc.debit - acc.credit;
        if (net !== 0) {
          expenseEntries.push({ id: acc.id, name: acc.name, amount: net });
          totalExpenseNet += net;
        }
      }
    }

    const netProfit = totalRevenueNet - totalExpenseNet; // 正 = 净利润, 负 = 净亏损

    // ── 6. 查找关键科目 ───────────────────────────────────────────────
    const [netProfitAccount, surplusReserveAccount] = await Promise.all([
      db.chartOfAccount.findFirst({ where: { companyId, code: "4103" } }), // 本年利润
      db.chartOfAccount.findFirst({ where: { companyId, code: "4101" } }), // 盈余公积
    ]);

    if (!netProfitAccount) {
      return NextResponse.json(
        { error: "未找到「本年利润」科目（4103），请先创建该科目" },
        { status: 400 }
      );
    }

    // ── 7. 生成凭证序号 ───────────────────────────────────────────────
    async function nextEntryNumber(
      tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]
    ) {
      const last = await tx.journalEntry.findFirst({
        where: { companyId },
        orderBy: { entryNumber: "desc" },
      });
      const seq = last
        ? parseInt(last.entryNumber.split("-")[2] ?? "0", 10) + 1
        : 1;
      return `JE-${fiscalYear!.year}-${String(seq).padStart(5, "0")}`;
    }

    // ── 8. 事务：创建结转凭证 ─────────────────────────────────────────
    await db.$transaction(async (tx) => {
      // ── 凭证A：损益结转 ──────────────────────────────────────────────
      // 只有有收入/费用时才生成
      if (revenueEntries.length > 0 || expenseEntries.length > 0) {
        const entryNumA = await nextEntryNumber(tx);

        // 借贷行
        // 借：各收入科目（余额归零）；贷：各费用科目（余额归零）；净利润差额记本年利润
        const linesA: {
          lineNumber: number;
          accountId: string;
          description: string;
          debitAmount: Decimal;
          creditAmount: Decimal;
          debitAmountLC: Decimal;
          creditAmountLC: Decimal;
          currency: string;
          exchangeRate: Decimal;
        }[] = [];
        let lineNum = 1;

        for (const r of revenueEntries) {
          linesA.push({
            lineNumber: lineNum++,
            accountId: r.id,
            description: "损益结转",
            debitAmount: new Decimal(r.amount.toFixed(4)),
            creditAmount: new Decimal("0"),
            debitAmountLC: new Decimal(r.amount.toFixed(4)),
            creditAmountLC: new Decimal("0"),
            currency: "CNY",
            exchangeRate: new Decimal("1"),
          });
        }
        for (const e of expenseEntries) {
          linesA.push({
            lineNumber: lineNum++,
            accountId: e.id,
            description: "损益结转",
            debitAmount: new Decimal("0"),
            creditAmount: new Decimal(e.amount.toFixed(4)),
            debitAmountLC: new Decimal("0"),
            creditAmountLC: new Decimal(e.amount.toFixed(4)),
            currency: "CNY",
            exchangeRate: new Decimal("1"),
          });
        }

        // 本年利润行（净利润贷，净亏损借）
        const absNetProfit = Math.abs(netProfit);
        linesA.push({
          lineNumber: lineNum++,
          accountId: netProfitAccount.id,
          description: "损益结转",
          debitAmount: netProfit < 0 ? new Decimal(absNetProfit.toFixed(4)) : new Decimal("0"),
          creditAmount: netProfit >= 0 ? new Decimal(absNetProfit.toFixed(4)) : new Decimal("0"),
          debitAmountLC: netProfit < 0 ? new Decimal(absNetProfit.toFixed(4)) : new Decimal("0"),
          creditAmountLC: netProfit >= 0 ? new Decimal(absNetProfit.toFixed(4)) : new Decimal("0"),
          currency: "CNY",
          exchangeRate: new Decimal("1"),
        });

        const totalDebitA = linesA.reduce((s, l) => s + parseFloat(l.debitAmount.toString()), 0);
        const totalCreditA = linesA.reduce((s, l) => s + parseFloat(l.creditAmount.toString()), 0);

        const entryA = await tx.journalEntry.create({
          data: {
            companyId,
            fiscalPeriodId: lastPeriod.id,
            entryNumber: entryNumA,
            entryDate: yearEndDate,
            description: `${fiscalYear.year}年度损益结转`,
            currency: "CNY",
            status: "POSTED",
            totalDebit: new Decimal(totalDebitA.toFixed(4)),
            totalCredit: new Decimal(totalCreditA.toFixed(4)),
            isBalanced: true,
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date(),
            postedAt: new Date(),
          },
        });

        await tx.journalEntryLine.createMany({
          data: linesA.map((l) => ({ ...l, journalEntryId: entryA.id })),
        });

        // Audit
        await tx.auditLog.create({
          data: {
            companyId,
            userId: userId,
            action: "POST",
            entityType: "JournalEntry",
            entityId: entryA.id,
            description: `年末结账：生成损益结转凭证 ${entryNumA}`,
          },
        });
      }

      // ── 凭证B：盈余公积计提（仅净利润 > 0 且存在盈余公积科目时）──────
      if (netProfit > 0 && surplusReserveAccount) {
        const surplusAmount = netProfit * 0.1;
        const entryNumB = await nextEntryNumber(tx);

        const entryB = await tx.journalEntry.create({
          data: {
            companyId,
            fiscalPeriodId: lastPeriod.id,
            entryNumber: entryNumB,
            entryDate: yearEndDate,
            description: `${fiscalYear.year}年度法定盈余公积计提（净利润 10%）`,
            currency: "CNY",
            status: "POSTED",
            totalDebit: new Decimal(surplusAmount.toFixed(4)),
            totalCredit: new Decimal(surplusAmount.toFixed(4)),
            isBalanced: true,
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date(),
            postedAt: new Date(),
          },
        });

        await tx.journalEntryLine.createMany({
          data: [
            {
              journalEntryId: entryB.id,
              lineNumber: 1,
              accountId: netProfitAccount.id,
              description: "提取法定盈余公积",
              debitAmount: new Decimal(surplusAmount.toFixed(4)),
              creditAmount: new Decimal("0"),
              debitAmountLC: new Decimal(surplusAmount.toFixed(4)),
              creditAmountLC: new Decimal("0"),
              currency: "CNY",
              exchangeRate: new Decimal("1"),
            },
            {
              journalEntryId: entryB.id,
              lineNumber: 2,
              accountId: surplusReserveAccount.id,
              description: "提取法定盈余公积",
              debitAmount: new Decimal("0"),
              creditAmount: new Decimal(surplusAmount.toFixed(4)),
              debitAmountLC: new Decimal("0"),
              creditAmountLC: new Decimal(surplusAmount.toFixed(4)),
              currency: "CNY",
              exchangeRate: new Decimal("1"),
            },
          ],
        });

        await tx.auditLog.create({
          data: {
            companyId,
            userId: userId,
            action: "POST",
            entityType: "JournalEntry",
            entityId: entryB.id,
            description: `年末结账：生成盈余公积计提凭证 ${entryNumB}（¥${surplusAmount.toFixed(2)}）`,
          },
        });
      }

      // ── 关闭会计年度 ─────────────────────────────────────────────────
      await tx.fiscalYear.update({
        where: { id: fiscalYearId },
        data: { isClosed: true, closedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          companyId,
          userId: userId,
          action: "CLOSE_PERIOD",
          entityType: "FiscalYear",
          entityId: fiscalYearId,
          description: `${fiscalYear.year}年度年末结账完成，净利润：¥${netProfit.toFixed(2)}`,
        },
      });
    });

    return NextResponse.json({
      success: true,
      netProfit: netProfit.toFixed(2),
      message: `年末结账完成！净利润：¥${netProfit.toFixed(2)}`,
    });
  } catch (error) {
    console.error("年末结账失败:", error);
    return NextResponse.json({ error: "服务器错误，请重试" }, { status: 500 });
  }
}
