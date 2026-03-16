import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { initChartOfAccounts } from "@/app/api/auth/register/route";
import { checkPermission } from "@/lib/permissions";

const createCompanySchema = z.object({
  name: z.string().min(2, "公司名称至少2个字符"),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  functionalCurrency: z.string().default("CNY"),
  industryType: z.enum(["GENERAL", "MANUFACTURING", "SERVICE", "TRADE", "CONSTRUCTION", "FINANCE"]).default("GENERAL"),
  vatType: z.enum(["GENERAL_TAXPAYER", "SMALL_SCALE", "EXEMPT"]).default("GENERAL_TAXPAYER"),
  incomeTaxRate: z.number().min(0).max(1).default(0.25),
  surtaxConfig: z.object({
    urbanMaintenance: z.number().min(0).max(1),
    educationSurcharge: z.number().min(0).max(1),
    localEducation: z.number().min(0).max(1),
  }).optional(),
  accountTemplate: z.enum(["GENERAL", "MANUFACTURING", "SERVICE", "TRADE"]).default("GENERAL"),
});

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createCompanySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "输入数据无效", details: parsed.error.flatten() }, { status: 400 });
    }

    const data = parsed.data;

    // 获取用户所属组织（只取第一个，且必须是 OWNER 或 ADMIN）
    const membership = await db.organizationMember.findFirst({
      where: {
        userId: session.user.id,
        role: { in: ["OWNER", "ADMIN"] },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "无权限创建公司" }, { status: 403 });
    }

    const canCreate = await checkPermission(session.user.id, membership.organizationId, "COMPANY", "CREATE");
    if (!canCreate) return NextResponse.json({ error: "权限不足：无法创建公司" }, { status: 403 });

    const companyCode = `COMP-${Date.now()}`;

    const company = await db.$transaction(async (tx) => {
      const newCompany = await tx.company.create({
        data: {
          organizationId: membership.organizationId,
          name: data.name,
          code: companyCode,
          legalName: data.legalName,
          taxId: data.taxId,
          functionalCurrency: data.functionalCurrency,
          industryType: data.industryType,
          vatType: data.vatType,
          incomeTaxRate: data.incomeTaxRate,
          surtaxConfig: data.surtaxConfig ?? undefined,
          accountTemplate: data.accountTemplate,
        },
      });

      // 初始化默认货币
      await tx.currency.upsert({
        where: { code: "CNY" },
        create: { code: "CNY", name: "人民币", nameEn: "Chinese Yuan", symbol: "¥", decimals: 2 },
        update: {},
      });

      // 创建当前年度和12个会计期间
      const currentYear = new Date().getFullYear();
      const fiscalYear = await tx.fiscalYear.create({
        data: {
          companyId: newCompany.id,
          year: currentYear,
          startDate: new Date(`${currentYear}-01-01`),
          endDate: new Date(`${currentYear}-12-31`),
        },
      });

      const months = ["一月", "二月", "三月", "四月", "五月", "六月",
                      "七月", "八月", "九月", "十月", "十一月", "十二月"];
      for (let i = 1; i <= 12; i++) {
        const startDate = new Date(currentYear, i - 1, 1);
        const endDate = new Date(currentYear, i, 0);
        await tx.fiscalPeriod.create({
          data: {
            fiscalYearId: fiscalYear.id,
            periodNumber: i,
            name: `${currentYear}年${months[i - 1]}`,
            startDate,
            endDate,
            status: "OPEN",
          },
        });
      }

      await initChartOfAccounts(tx, newCompany.id, data.accountTemplate);

      return newCompany;
    });

    return NextResponse.json({ success: true, companyId: company.id });
  } catch (error) {
    console.error("创建公司失败:", error);
    return NextResponse.json({ error: "服务器错误，请重试" }, { status: 500 });
  }
}
