import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getAccountTemplate } from "@/lib/account-templates";

const createSchema = z.object({
  mode: z.literal("create"),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  organizationName: z.string().min(2),
  companyName: z.string().min(2),
});

const joinSchema = z.object({
  mode: z.literal("join"),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  inviteCode: z.string().min(1),
});

const schema = z.discriminatedUnion("mode", [createSchema, joinSchema]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "输入数据无效" }, { status: 400 });
    }

    const data = parsed.data;

    // 检查邮箱是否已注册
    const existing = await db.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return NextResponse.json({ error: "该邮箱已被注册" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(data.password, 12);

    if (data.mode === "join") {
      // 加入已有组织
      const org = await db.organization.findUnique({ where: { inviteCode: data.inviteCode } });
      if (!org) {
        return NextResponse.json({ error: "邀请码无效，请确认后重试" }, { status: 400 });
      }

      const user = await db.$transaction(async (tx) => {
        const newUser = await tx.user.create({
          data: { name: data.name, email: data.email, password: hashedPassword },
        });
        await tx.organizationMember.create({
          data: { userId: newUser.id, organizationId: org.id, role: "ACCOUNTANT" },
        });
        return newUser;
      });

      return NextResponse.json({ success: true, userId: user.id });
    }

    // 创建新组织
    const { name, email: _email, password: _pw, organizationName, companyName } = data;

    // 生成唯一 slug
    const baseSlug = organizationName
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .substring(0, 40) || "org";

    let slug = baseSlug;
    let counter = 1;
    while (await db.organization.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${counter++}`;
    }

    const companyCode = `COMP-${Date.now()}`;

    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: { name, email: data.email, password: hashedPassword },
      });

      const org = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          members: { create: { userId: newUser.id, role: "OWNER" } },
        },
      });

      // 初始化默认货币
      await tx.currency.upsert({
        where: { code: "CNY" },
        create: { code: "CNY", name: "人民币", nameEn: "Chinese Yuan", symbol: "¥", decimals: 2 },
        update: {},
      });

      const company = await tx.company.create({
        data: {
          organizationId: org.id,
          name: companyName,
          code: companyCode,
          functionalCurrency: "CNY",
        },
      });

      const currentYear = new Date().getFullYear();
      const fiscalYear = await tx.fiscalYear.create({
        data: {
          companyId: company.id,
          year: currentYear,
          startDate: new Date(`${currentYear}-01-01`),
          endDate: new Date(`${currentYear}-12-31`),
        },
      });

      const months = [
        "一月", "二月", "三月", "四月", "五月", "六月",
        "七月", "八月", "九月", "十月", "十一月", "十二月",
      ];

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

      await initChartOfAccounts(tx, company.id, "GENERAL");

      return newUser;
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error) {
    console.error("注册失败:", error);
    return NextResponse.json({ error: "服务器错误，请重试" }, { status: 500 });
  }
}

export async function initChartOfAccounts(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  companyId: string,
  template: "GENERAL" | "MANUFACTURING" | "SERVICE" | "TRADE"
) {
  const accounts = getAccountTemplate(template);

  for (const acc of accounts) {
    await tx.chartOfAccount.create({
      data: {
        companyId,
        code: acc.code,
        name: acc.name,
        accountType: acc.type,
        normalBalance: acc.normal,
        level: 1,
        isLeaf: acc.isLeaf,
        reportCategory: acc.category,
      },
    });
  }
}
