import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  organizationName: z.string().min(2),
  companyName: z.string().min(2),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "输入数据无效" }, { status: 400 });
    }

    const { name, email, password, organizationName, companyName } = parsed.data;

    // 检查邮箱是否已注册
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "该邮箱已被注册" }, { status: 400 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

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

    // 生成公司代码
    const companyCode = `COMP-${Date.now()}`;

    // 事务：创建用户、组织、成员关系、公司
    const user = await db.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          name,
          email,
          password: hashedPassword,
        },
      });

      const org = await tx.organization.create({
        data: {
          name: organizationName,
          slug,
          members: {
            create: {
              userId: newUser.id,
              role: "OWNER",
            },
          },
        },
      });

      // 初始化默认货币
      await tx.currency.upsert({
        where: { code: "CNY" },
        create: { code: "CNY", name: "人民币", nameEn: "Chinese Yuan", symbol: "¥", decimals: 2 },
        update: {},
      });

      // 创建公司
      const company = await tx.company.create({
        data: {
          organizationId: org.id,
          name: companyName,
          code: companyCode,
          functionalCurrency: "CNY",
        },
      });

      // 初始化当前年度的会计期间
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

      // 初始化标准科目表（简化版）
      await initDefaultChartOfAccounts(tx, company.id);

      return newUser;
    });

    return NextResponse.json({ success: true, userId: user.id });
  } catch (error) {
    console.error("注册失败:", error);
    return NextResponse.json({ error: "服务器错误，请重试" }, { status: 500 });
  }
}

async function initDefaultChartOfAccounts(
  tx: Parameters<Parameters<typeof db.$transaction>[0]>[0],
  companyId: string
) {
  const accounts = [
    // 资产类
    { code: "1001", name: "库存现金", type: "ASSET", normal: "DEBIT", isLeaf: true },
    { code: "1002", name: "银行存款", type: "ASSET", normal: "DEBIT", isLeaf: true },
    { code: "1122", name: "应收账款", type: "ASSET", normal: "DEBIT", isLeaf: true },
    { code: "1405", name: "库存商品", type: "ASSET", normal: "DEBIT", isLeaf: true },
    { code: "1601", name: "固定资产", type: "ASSET", normal: "DEBIT", isLeaf: true },
    { code: "1602", name: "累计折旧", type: "ASSET", normal: "CREDIT", isLeaf: true },
    // 负债类
    { code: "2202", name: "应付账款", type: "LIABILITY", normal: "CREDIT", isLeaf: true },
    { code: "2221", name: "应交税费", type: "LIABILITY", normal: "CREDIT", isLeaf: true },
    { code: "2241", name: "其他应付款", type: "LIABILITY", normal: "CREDIT", isLeaf: true },
    // 所有者权益
    { code: "4001", name: "实收资本", type: "EQUITY", normal: "CREDIT", isLeaf: true },
    { code: "4002", name: "资本公积", type: "EQUITY", normal: "CREDIT", isLeaf: true },
    { code: "4101", name: "盈余公积", type: "EQUITY", normal: "CREDIT", isLeaf: true },
    { code: "4103", name: "本年利润", type: "EQUITY", normal: "CREDIT", isLeaf: true },
    { code: "4104", name: "利润分配", type: "EQUITY", normal: "CREDIT", isLeaf: true },
    // 收入类
    { code: "6001", name: "主营业务收入", type: "REVENUE", normal: "CREDIT", isLeaf: true },
    { code: "6051", name: "其他业务收入", type: "REVENUE", normal: "CREDIT", isLeaf: true },
    // 费用类
    { code: "6401", name: "主营业务成本", type: "EXPENSE", normal: "DEBIT", isLeaf: true },
    { code: "6601", name: "销售费用", type: "EXPENSE", normal: "DEBIT", isLeaf: true },
    { code: "6602", name: "管理费用", type: "EXPENSE", normal: "DEBIT", isLeaf: true },
    { code: "6603", name: "财务费用", type: "EXPENSE", normal: "DEBIT", isLeaf: true },
    { code: "6711", name: "营业外支出", type: "EXPENSE", normal: "DEBIT", isLeaf: true },
  ];

  for (const acc of accounts) {
    await tx.chartOfAccount.create({
      data: {
        companyId,
        code: acc.code,
        name: acc.name,
        accountType: acc.type as "ASSET" | "LIABILITY" | "EQUITY" | "REVENUE" | "EXPENSE",
        normalBalance: acc.normal as "DEBIT" | "CREDIT",
        level: 1,
        isLeaf: acc.isLeaf,
      },
    });
  }
}
