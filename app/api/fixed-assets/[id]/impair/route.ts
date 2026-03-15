import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * POST /api/fixed-assets/[id]/impair
 *
 * 计提固定资产减值准备（CAS 8）
 * 会计分录：
 *   借：资产减值损失（6701 或 fallback 6711）
 *   贷：固定资产减值准备（1603）
 *
 * 注：CAS 8 规定固定资产减值准备一经计提不可转回。
 *
 * Body: { impairDate, impairAmount, impairReason, fiscalPeriodId, generateEntry }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });

  const { id } = await params;

  const asset = await db.fixedAsset.findUnique({
    where: { id },
    select: {
      id:                    true,
      companyId:             true,
      assetNumber:           true,
      name:                  true,
      acquisitionCost:       true,
      accumulatedDepreciation: true,
      impairmentReserve:     true,
      residualRate:          true,
      usefulLifeMonths:      true,
      status:                true,
      costAccountId:         true,
    },
  });
  if (!asset) return NextResponse.json({ error: "资产不存在" }, { status: 404 });
  if (asset.status === "DISPOSED") {
    return NextResponse.json({ error: "已处置资产不可计提减值" }, { status: 400 });
  }

  // 权限校验
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
    impairDate:     string;
    impairAmount:   number;
    impairReason?:  string;
    fiscalPeriodId?: string;
    generateEntry?: boolean;
  };

  const { impairDate, impairAmount, impairReason, fiscalPeriodId, generateEntry = true } = body;

  if (!impairAmount || impairAmount <= 0) {
    return NextResponse.json({ error: "减值金额必须大于 0" }, { status: 400 });
  }

  // 验证减值金额不超过剩余账面净值（不含已有减值准备）
  const cost        = Number(asset.acquisitionCost);
  const accDep      = Number(asset.accumulatedDepreciation);
  const existingImp = Number(asset.impairmentReserve);
  const bookValue   = cost - accDep - existingImp;

  if (impairAmount > bookValue + 0.005) {
    return NextResponse.json({
      error: `减值金额（¥${impairAmount.toFixed(2)}）不得超过当前账面净值（¥${bookValue.toFixed(2)}）`,
    }, { status: 400 });
  }

  const userId = session.user!.id as string;

  const result = await db.$transaction(async (tx) => {
    // 1. 更新资产减值准备余额
    const updated = await tx.fixedAsset.update({
      where: { id },
      data: {
        impairmentReserve: { increment: impairAmount },
      },
      select: { id: true, assetNumber: true, impairmentReserve: true },
    });

    let je = null;

    if (generateEntry && fiscalPeriodId) {
      // 验证期间是否开放
      const period = await tx.fiscalPeriod.findUnique({
        where: { id: fiscalPeriodId },
        select: { id: true, startDate: true, status: true },
      });
      if (!period || period.status === "CLOSED") {
        throw new Error("期间已关闭，无法生成减值凭证");
      }

      // 查找科目（动态查找，防止科目表不同）
      const findAcct = async (code: string) =>
        tx.chartOfAccount.findFirst({
          where: { companyId: asset.companyId, code, isActive: true },
          select: { id: true, name: true },
        });

      // 1603 固定资产减值准备（必须存在）
      const impReserveAcct = await findAcct("1603");
      if (!impReserveAcct) {
        throw new Error(
          "未找到固定资产减值准备科目（1603），请先在科目表中添加编码为 1603、类型为资产的科目"
        );
      }

      // 资产减值损失（优先 6701，fallback 6711 营业外支出）
      const impLossAcct =
        (await findAcct("6701")) ?? (await findAcct("6711"));
      if (!impLossAcct) {
        throw new Error(
          "未找到资产减值损失科目（6701）或营业外支出科目（6711），请先在科目表中添加相关科目"
        );
      }

      const amt = +impairAmount.toFixed(2);

      // 序号生成（与 dispose 一致）
      const impairYear = period.startDate.getFullYear();
      const lastEntry = await tx.journalEntry.findFirst({
        where: { companyId: asset.companyId, entryNumber: { startsWith: `JE-${impairYear}-` } },
        orderBy: { entryNumber: "desc" },
        select: { entryNumber: true },
      });
      let nextSeq = 1;
      if (lastEntry) {
        const parts = lastEntry.entryNumber.split("-");
        nextSeq = parseInt(parts[2] ?? "0", 10) + 1;
      }
      const entryNumber = `JE-${impairYear}-${String(nextSeq).padStart(5, "0")}`;

      // 生成 DRAFT 凭证：借 资产减值损失 / 贷 固定资产减值准备
      je = await tx.journalEntry.create({
        data: {
          companyId:     asset.companyId,
          fiscalPeriodId,
          entryNumber,
          entryDate:     new Date(impairDate),
          description:   `固定资产减值准备 ${asset.assetNumber} ${asset.name}`,
          status:        "DRAFT",
          totalDebit:    amt,
          totalCredit:   amt,
          createdById:   userId,
          lines: {
            create: [
              {
                lineNumber:    1,
                accountId:     impLossAcct.id,
                description:   `计提减值损失-${asset.assetNumber}`,
                debitAmount:   amt,
                creditAmount:  0,
                currency:      "CNY",
                exchangeRate:  1,
                debitAmountLC: amt,
                creditAmountLC: 0,
              },
              {
                lineNumber:    2,
                accountId:     impReserveAcct.id,
                description:   `计提减值准备-${asset.assetNumber}`,
                debitAmount:   0,
                creditAmount:  amt,
                currency:      "CNY",
                exchangeRate:  1,
                debitAmountLC: 0,
                creditAmountLC: amt,
              },
            ],
          },
        },
        select: { id: true, entryNumber: true },
      });
    }

    await tx.auditLog.create({
      data: {
        companyId:   asset.companyId,
        userId,
        action:      "UPDATE",
        entityType:  "FixedAsset",
        entityId:    id,
        description: `计提固定资产减值准备 ${asset.assetNumber}，减值金额 ¥${impairAmount.toFixed(2)}，原因：${impairReason ?? "未说明"}`,
      },
    });

    return { updated, je };
  });

  return NextResponse.json({
    success:           true,
    assetNumber:       asset.assetNumber,
    impairAmount:      +impairAmount.toFixed(2),
    totalImpairment:   parseFloat(result.updated.impairmentReserve.toString()),
    newBookValue:      +(bookValue - impairAmount).toFixed(2),
    entryId:           result.je?.id,
    entryNumber:       result.je?.entryNumber,
  });
}
