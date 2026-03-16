import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import Decimal from "decimal.js";
import { checkPermission } from "@/lib/permissions";

const lineSchema = z.object({
  lineNumber: z.number().int().positive(),
  accountId: z.string(),
  description: z.string().optional(),
  debitAmount: z.string().default("0"),
  creditAmount: z.string().default("0"),
  currency: z.string().default("CNY"),
  exchangeRate: z.string().default("1"),
  isIntercompany: z.boolean().default(false),
  counterpartyCompanyId: z.string().optional(),
});

const createSchema = z.object({
  companyId: z.string(),
  fiscalPeriodId: z.string(),
  entryDate: z.string(), // YYYY-MM-DD
  description: z.string().min(1),
  reference: z.string().optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL"]).default("DRAFT"),
  lines: z.array(lineSchema).min(2),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "数据验证失败", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // 验证期间是否开放（支持 OPEN 和 SOFT_CLOSE）
    const period = await db.fiscalPeriod.findFirst({
      where: { id: data.fiscalPeriodId, status: { in: ["OPEN", "SOFT_CLOSE"] } },
      include: { fiscalYear: { include: { company: true } } },
    });

    if (!period) {
      return NextResponse.json({ error: "所选期间不存在或已关闭" }, { status: 400 });
    }

    if (period.fiscalYear.isClosed) {
      return NextResponse.json({ error: "会计年度已结账" }, { status: 400 });
    }

    const orgId = period.fiscalYear.company.organizationId;

    // 权限检查：CREATE JOURNAL_ENTRY
    const canCreate = await checkPermission(session.user.id, orgId, "JOURNAL_ENTRY", "CREATE", data.companyId);
    if (!canCreate) {
      return NextResponse.json({ error: "权限不足：无法新建凭证" }, { status: 403 });
    }

    // 软关账期间：仅 ACCOUNTANT/ADMIN/OWNER 可录入调整分录
    if (period.status === "SOFT_CLOSE") {
      const member = await db.organizationMember.findFirst({
        where: { userId: session.user.id, organizationId: orgId },
        select: { role: true },
      });
      if (!member || !["ACCOUNTANT", "ADMIN", "OWNER"].includes(member.role)) {
        return NextResponse.json({ error: "期间已软关账，仅会计/管理员可录入调整分录" }, { status: 403 });
      }
    }

    // 计算合计（提交时才校验平衡）
    const totalDebit = data.lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.debitAmount)),
      new Decimal(0)
    );
    const totalCredit = data.lines.reduce(
      (sum, l) => sum.plus(new Decimal(l.creditAmount)),
      new Decimal(0)
    );

    if (data.status === "PENDING_APPROVAL" && !totalDebit.equals(totalCredit)) {
      return NextResponse.json({ error: "借贷不平衡，无法提交审批" }, { status: 400 });
    }

    if (data.status === "PENDING_APPROVAL" && totalDebit.lte(0)) {
      return NextResponse.json({ error: "凭证金额不能为零" }, { status: 400 });
    }

    // 验证所有科目都是末级科目
    const accountIds = data.lines.map((l) => l.accountId);
    const accounts = await db.chartOfAccount.findMany({
      where: { id: { in: accountIds }, companyId: data.companyId },
    });

    const invalidAccounts = accounts.filter((a) => !a.isLeaf);
    if (invalidAccounts.length > 0) {
      return NextResponse.json(
        {
          error: `以下科目不是末级科目，不能记账：${invalidAccounts.map((a) => a.name).join("、")}`,
        },
        { status: 400 }
      );
    }

    // 生成凭证编号（序号按公司+年度独立计数，每年从00001重新开始）
    const entryDate = new Date(data.entryDate);
    const year = entryDate.getFullYear();
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd   = new Date(`${year + 1}-01-01T00:00:00.000Z`);
    const count = await db.journalEntry.count({
      where: {
        companyId: data.companyId,
        entryDate: { gte: yearStart, lt: yearEnd },
      },
    });
    const entryNumber = `JE-${year}-${String(count + 1).padStart(5, "0")}`;

    // 创建凭证
    const entry = await db.journalEntry.create({
      data: {
        companyId: data.companyId,
        fiscalPeriodId: data.fiscalPeriodId,
        entryNumber,
        entryDate: new Date(data.entryDate),
        description: data.description,
        reference: data.reference,
        currency: "CNY",
        status: data.status,
        totalDebit: totalDebit.toFixed(4),
        totalCredit: totalCredit.toFixed(4),
        isBalanced: totalDebit.equals(totalCredit),
        createdById: session.user.id,
        lines: {
          create: data.lines.map((l) => ({
            lineNumber: l.lineNumber,
            accountId: l.accountId,
            description: l.description,
            debitAmount: new Decimal(l.debitAmount).toFixed(4),
            creditAmount: new Decimal(l.creditAmount).toFixed(4),
            currency: l.currency,
            exchangeRate: new Decimal(l.exchangeRate).toFixed(10),
            debitAmountLC: new Decimal(l.debitAmount).toFixed(4),
            creditAmountLC: new Decimal(l.creditAmount).toFixed(4),
            isIntercompany: l.isIntercompany,
            counterpartyCompanyId: l.counterpartyCompanyId ?? null,
          })),
        },
      },
    });

    // 审计日志
    await db.auditLog.create({
      data: {
        companyId: data.companyId,
        userId: session.user.id,
        action: "CREATE",
        entityType: "JournalEntry",
        entityId: entry.id,
        description: `创建凭证 ${entryNumber}`,
        newValues: { status: data.status, totalDebit: totalDebit.toString() },
      },
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("创建凭证失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
