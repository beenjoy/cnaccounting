import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

// POST /api/fixed-assets/[id]/dispose
// Body: { disposalDate, disposalAmount, disposalNotes, fiscalPeriodId, generateEntry }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;
  const asset = await db.fixedAsset.findUnique({
    where: { id },
    select: {
      id: true,
      companyId: true,
      assetNumber: true,
      name: true,
      acquisitionCost: true,
      residualRate: true,
      accumulatedDepreciation: true,
      impairmentReserve: true,
      costAccountId: true,
      accDepAccountId: true,
      status: true,
    },
  });
  if (!asset) return NextResponse.json({ error: "资产不存在" }, { status: 404 });
  if (asset.status === "DISPOSED") {
    return NextResponse.json({ error: "该资产已处置" }, { status: 400 });
  }

  const company = await db.company.findUnique({
    where: { id: asset.companyId },
    select: { organizationId: true },
  });
  const member = await db.organizationMember.findFirst({
    where: { organizationId: company!.organizationId, userId: session.user.id },
    select: { role: true },
  });
  if (!member || !["OWNER", "ADMIN", "ACCOUNTANT"].includes(member.role)) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }

  const body = await req.json() as {
    disposalDate: string;
    disposalAmount: number;         // 处置收入（0 = 报废）
    disposalNotes?: string;
    fiscalPeriodId?: string;
    generateEntry?: boolean;        // 是否生成处置凭证
  };

  const { disposalDate, disposalAmount = 0, disposalNotes, fiscalPeriodId, generateEntry = true } = body;

  const cost = Number(asset.acquisitionCost);
  const accDep = Number(asset.accumulatedDepreciation);
  const impairment = Number(asset.impairmentReserve);
  const bookValue = cost - accDep - impairment;  // 账面净值
  const gainLoss = disposalAmount - bookValue;   // >0 盈利, <0 亏损

  const userId = session.user!.id as string;

  const result = await db.$transaction(async (tx) => {
    // Mark asset as disposed
    const updatedAsset = await tx.fixedAsset.update({
      where: { id },
      data: {
        status: "DISPOSED",
        disposalDate: new Date(disposalDate),
        disposalAmount,
        disposalNotes: disposalNotes ?? null,
      },
    });

    let je = null;

    if (generateEntry && fiscalPeriodId) {
      // Verify period is open
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: fiscalPeriodId },
        select: { id: true, name: true, startDate: true, endDate: true, status: true },
      });
      if (!period || period.status === "CLOSED") {
        throw new Error("期间已关闭，无法生成处置凭证");
      }

      // Find or fallback accounts
      const findAcct = async (code: string) =>
        tx.chartOfAccount.findFirst({ where: { companyId: asset.companyId, code, isActive: true }, select: { id: true } });

      const costAcct = asset.costAccountId
        ? { id: asset.costAccountId }
        : await findAcct("1601");  // 固定资产
      const accDepAcct = asset.accDepAccountId
        ? { id: asset.accDepAccountId }
        : await findAcct("1602");  // 累计折旧
      const clearingAcct = await findAcct("1606"); // 固定资产清理
      const bankAcct = await findAcct("1002");     // 银行存款
      const disposalGainAcct = await findAcct("6301"); // 资产处置收益 (P&L)
      const nonOpExpAcct = await findAcct("6711");  // 营业外支出

      if (!costAcct || !accDepAcct || !clearingAcct) {
        throw new Error("未找到固定资产相关科目（1601/1602/1606），请先完善科目表");
      }

      type JeLine = { accountId: string; description: string; debit: number; credit: number };
      const lines: JeLine[] = [];

      // Step 1: Transfer to clearing account
      // Dr 固定资产清理 (bookValue)
      // Dr 累计折旧   (accDep)
      // Cr 固定资产   (cost)
      lines.push({ accountId: clearingAcct.id, description: `固定资产清理-${asset.assetNumber}`, debit: +bookValue.toFixed(2), credit: 0 });
      if (accDep > 0) {
        lines.push({ accountId: accDepAcct.id, description: `注销累计折旧-${asset.assetNumber}`, debit: +accDep.toFixed(2), credit: 0 });
      }
      lines.push({ accountId: costAcct.id, description: `注销固定资产原值-${asset.assetNumber}`, debit: 0, credit: +cost.toFixed(2) });

      // Step 2: If impairment reserve exists
      if (impairment > 0) {
        const impAcct = await findAcct("1603"); // 固定资产减值准备
        if (impAcct) {
          lines.push({ accountId: impAcct.id, description: `注销减值准备-${asset.assetNumber}`, debit: +impairment.toFixed(2), credit: 0 });
          lines.push({ accountId: clearingAcct.id, description: `结转减值准备`, debit: 0, credit: +impairment.toFixed(2) });
        }
      }

      // Step 3: Disposal proceeds
      if (disposalAmount > 0 && bankAcct) {
        lines.push({ accountId: bankAcct.id, description: `收到处置款项`, debit: +disposalAmount.toFixed(2), credit: 0 });
        lines.push({ accountId: clearingAcct.id, description: `处置收款入清理`, debit: 0, credit: +disposalAmount.toFixed(2) });
      }

      // Step 4: Gain or loss
      if (gainLoss > 0.005 && disposalGainAcct) {
        // Profit: Dr 固定资产清理 / Cr 资产处置收益
        lines.push({ accountId: clearingAcct.id, description: `处置收益结转`, debit: +gainLoss.toFixed(2), credit: 0 });
        lines.push({ accountId: disposalGainAcct.id, description: `固定资产处置收益`, debit: 0, credit: +gainLoss.toFixed(2) });
      } else if (gainLoss < -0.005 && nonOpExpAcct) {
        // Loss: Dr 营业外支出 / Cr 固定资产清理
        lines.push({ accountId: nonOpExpAcct.id, description: `固定资产处置损失`, debit: +(-gainLoss).toFixed(2), credit: 0 });
        lines.push({ accountId: clearingAcct.id, description: `处置损失结转`, debit: 0, credit: +(-gainLoss).toFixed(2) });
      }

      const totalDebit = +lines.reduce((s, l) => s + l.debit, 0).toFixed(2);
      const totalCredit = +lines.reduce((s, l) => s + l.credit, 0).toFixed(2);

      const year = period.startDate.getFullYear();
      const lastEntry = await tx.journalEntry.findFirst({
        where: { companyId: asset.companyId, entryNumber: { startsWith: `JE-${year}-` } },
        orderBy: { entryNumber: "desc" },
        select: { entryNumber: true },
      });
      let nextSeq = 1;
      if (lastEntry) {
        const parts = lastEntry.entryNumber.split("-");
        nextSeq = parseInt(parts[2] ?? "0", 10) + 1;
      }
      const entryNumber = `JE-${year}-${String(nextSeq).padStart(5, "0")}`;

      je = await tx.journalEntry.create({
        data: {
          companyId: asset.companyId,
          fiscalPeriodId,
          entryNumber,
          entryDate: new Date(disposalDate),
          description: `固定资产处置凭证 ${asset.assetNumber} ${asset.name}`,
          status: "DRAFT",
          totalDebit,
          totalCredit,
          createdById: userId,
          lines: {
            create: lines.map((l, i) => ({
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
    }

    await tx.auditLog.create({
      data: {
        companyId: asset.companyId,
        userId,
        action: "UPDATE",
        entityType: "FixedAsset",
        entityId: id,
        description: `处置固定资产 ${asset.assetNumber}，处置收入 ¥${disposalAmount.toFixed(2)}，损益 ¥${gainLoss.toFixed(2)}`,
      },
    });

    return { asset: updatedAsset, je, bookValue, gainLoss };
  });

  return NextResponse.json({
    success: true,
    assetNumber: asset.assetNumber,
    bookValue: +result.bookValue.toFixed(2),
    gainLoss: +result.gainLoss.toFixed(2),
    entryId: result.je?.id,
    entryNumber: result.je?.entryNumber,
  });
}
