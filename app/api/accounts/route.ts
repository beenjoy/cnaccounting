import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import { checkPermission } from "@/lib/permissions";

const REPORT_CATEGORIES = [
  "CURRENT_ASSET", "NON_CURRENT_ASSET",
  "CURRENT_LIABILITY", "NON_CURRENT_LIABILITY",
  "EQUITY_ITEM",
  "OPERATING_REVENUE", "NON_OPERATING_INCOME",
  "OPERATING_COST", "PERIOD_EXPENSE", "NON_OPERATING_EXPENSE", "INCOME_TAX",
] as const;

const createSchema = z.object({
  companyId: z.string(),
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(100),
  accountType: z.enum(["ASSET", "LIABILITY", "EQUITY", "REVENUE", "EXPENSE"]),
  normalBalance: z.enum(["DEBIT", "CREDIT"]),
  parentId: z.string().optional(),
  isLeaf: z.boolean(),
  reportCategory: z.enum(REPORT_CATEGORIES).optional().nullable(),
  description: z.string().optional(),
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
      return NextResponse.json({ error: "数据验证失败" }, { status: 400 });
    }

    const data = parsed.data;

    // 权限检查
    const company = await db.company.findUnique({
      where: { id: data.companyId },
      select: { organizationId: true },
    });
    if (!company) return NextResponse.json({ error: "公司不存在" }, { status: 404 });
    const canCreate = await checkPermission(session.user.id, company.organizationId, "CHART_OF_ACCOUNT", "CREATE", data.companyId);
    if (!canCreate) return NextResponse.json({ error: "权限不足：无法创建科目" }, { status: 403 });

    // 检查编码是否重复
    const existing = await db.chartOfAccount.findFirst({
      where: { companyId: data.companyId, code: data.code },
    });
    if (existing) {
      return NextResponse.json({ error: "科目编码已存在" }, { status: 400 });
    }

    // 确定层级
    let level = 1;
    if (data.parentId) {
      const parent = await db.chartOfAccount.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        return NextResponse.json({ error: "父科目不存在" }, { status: 400 });
      }
      if (parent.accountType !== data.accountType) {
        return NextResponse.json(
          { error: "子科目类型必须与父科目相同" },
          { status: 400 }
        );
      }
      level = parent.level + 1;

      // 父科目变为汇总科目
      await db.chartOfAccount.update({
        where: { id: data.parentId },
        data: { isLeaf: false, isSummary: true },
      });
    }

    const account = await db.chartOfAccount.create({
      data: {
        companyId: data.companyId,
        code: data.code,
        name: data.name,
        accountType: data.accountType,
        normalBalance: data.normalBalance,
        parentId: data.parentId,
        level,
        isLeaf: data.isLeaf,
        reportCategory: data.reportCategory ?? null,
        description: data.description,
      },
    });

    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    console.error("创建科目失败:", error);
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
