import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import Decimal from "decimal.js";

const schema = z.object({
  action: z.enum(["approve", "reject", "post", "reverse"]),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "数据验证失败" }, { status: 400 });
    }

    const { action } = parsed.data;

    const entry = await db.journalEntry.findUnique({
      where: { id },
      include: {
        lines: true,
        fiscalPeriod: true,
      },
    });

    if (!entry) {
      return NextResponse.json({ error: "凭证不存在" }, { status: 404 });
    }

    // 验证状态流转
    const validTransitions: Record<string, string[]> = {
      approve: ["PENDING_APPROVAL"],
      reject: ["PENDING_APPROVAL"],
      post: ["APPROVED"],
      reverse: ["POSTED"],
    };

    if (!validTransitions[action]?.includes(entry.status)) {
      return NextResponse.json(
        { error: `当前状态「${entry.status}」不支持该操作` },
        { status: 400 }
      );
    }

    // 审批不能自审
    if (action === "approve" && entry.createdById === session.user.id) {
      return NextResponse.json({ error: "不能审批自己创建的凭证" }, { status: 400 });
    }

    let result;
    let reversalEntryId: string | undefined;

    if (action === "approve") {
      result = await db.journalEntry.update({
        where: { id },
        data: {
          status: "APPROVED",
          approvedById: session.user.id,
          approvedAt: new Date(),
        },
      });
    } else if (action === "reject") {
      result = await db.journalEntry.update({
        where: { id },
        data: { status: "DRAFT" },
      });
    } else if (action === "post") {
      // 验证期间仍然开放
      if (entry.fiscalPeriod.status !== "OPEN") {
        return NextResponse.json({ error: "所在期间已关闭，无法过账" }, { status: 400 });
      }

      result = await db.journalEntry.update({
        where: { id },
        data: {
          status: "POSTED",
          postedAt: new Date(),
        },
      });
    } else if (action === "reverse") {
      // 创建冲销凭证
      const reversalNumber = `${entry.entryNumber}-REV`;

      const reversalEntry = await db.$transaction(async (tx) => {
        const reversal = await tx.journalEntry.create({
          data: {
            companyId: entry.companyId,
            fiscalPeriodId: entry.fiscalPeriodId,
            entryNumber: reversalNumber,
            entryDate: new Date(),
            description: `冲销 ${entry.entryNumber}: ${entry.description}`,
            currency: entry.currency,
            status: "POSTED",
            totalDebit: entry.totalCredit,
            totalCredit: entry.totalDebit,
            isBalanced: entry.isBalanced,
            createdById: session.user!.id as string,
            approvedById: session.user!.id as string,
            approvedAt: new Date(),
            postedAt: new Date(),
            reversedEntryId: entry.id,
            lines: {
              create: entry.lines.map((l) => ({
                lineNumber: l.lineNumber,
                accountId: l.accountId,
                description: l.description,
                // 借贷互换
                debitAmount: l.creditAmount,
                creditAmount: l.debitAmount,
                debitAmountLC: l.creditAmountLC,
                creditAmountLC: l.debitAmountLC,
                currency: l.currency,
                exchangeRate: l.exchangeRate,
              })),
            },
          },
        });

        // 更新原凭证状态
        await tx.journalEntry.update({
          where: { id },
          data: {
            status: "REVERSED",
            reversalEntryId: reversal.id,
          },
        });

        return reversal;
      });

      reversalEntryId = reversalEntry.id;
      result = entry;
    }

    // 审计日志
    const actionDescriptions: Record<string, string> = {
      approve: `审批通过凭证 ${entry.entryNumber}`,
      reject: `退回凭证 ${entry.entryNumber}`,
      post: `过账凭证 ${entry.entryNumber}`,
      reverse: `冲销凭证 ${entry.entryNumber}`,
    };

    await db.auditLog.create({
      data: {
        companyId: entry.companyId,
        userId: session.user!.id as string,
        action: (action === "post" ? "POST" : action === "reverse" ? "REVERSE" : action === "approve" ? "APPROVE" : "REJECT") as "POST" | "REVERSE" | "APPROVE" | "REJECT",
        entityType: "JournalEntry",
        entityId: id,
        description: actionDescriptions[action],
      },
    });

    return NextResponse.json({ entry: result, reversalEntryId });
  } catch (error) {
    console.error("凭证操作失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
