/**
 * 全套演示数据种子脚本
 * 覆盖：组织/公司/用户/科目/货币/汇率/客户/供应商/凭证/AR/AP/固定资产/折旧/增值税/合并报表/凭证模板
 *
 * 运行：npm run db:seed
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getAccountTemplate } from "../lib/account-templates";
import { BUILT_IN_TEMPLATES } from "../lib/journal-template-seeds";

const prisma = new PrismaClient();

// ─────────────────────────────────────────
// 辅助：生成凭证编号
// ─────────────────────────────────────────
function jeNum(year: number, seq: number) {
  return `JE-${year}-${String(seq).padStart(5, "0")}`;
}
function faNum(year: number, seq: number) {
  return `FA-${year}-${String(seq).padStart(5, "0")}`;
}
function arNum(year: number, seq: number) {
  return `AR-${year}-${String(seq).padStart(5, "0")}`;
}
function apNum(year: number, seq: number) {
  return `AP-${year}-${String(seq).padStart(5, "0")}`;
}

// ─────────────────────────────────────────
// 主程序
// ─────────────────────────────────────────
async function main() {
  console.log("🌱 开始初始化演示数据...\n");

  // ════════════════════════════════════════
  // 1. 货币
  // ════════════════════════════════════════
  console.log("📌 [1/13] 创建货币...");
  const currencies = [
    { code: "CNY", name: "人民币",   nameEn: "Chinese Yuan Renminbi", symbol: "¥",  decimals: 2 },
    { code: "USD", name: "美元",     nameEn: "US Dollar",              symbol: "$",  decimals: 2 },
    { code: "EUR", name: "欧元",     nameEn: "Euro",                   symbol: "€",  decimals: 2 },
    { code: "JPY", name: "日元",     nameEn: "Japanese Yen",           symbol: "¥",  decimals: 0 },
    { code: "HKD", name: "港元",     nameEn: "Hong Kong Dollar",       symbol: "HK$",decimals: 2 },
    { code: "GBP", name: "英镑",     nameEn: "British Pound Sterling", symbol: "£",  decimals: 2 },
  ];
  for (const c of currencies) {
    await prisma.currency.upsert({ where: { code: c.code }, create: c, update: {} });
  }

  // ════════════════════════════════════════
  // 2. 汇率（USD/EUR/JPY/HKD/GBP → CNY，三个月各一条）
  // ════════════════════════════════════════
  console.log("📌 [2/13] 创建汇率...");
  const rateData = [
    // 2026-01-01
    { from: "USD", to: "CNY", rate: "7.2456", date: new Date("2026-01-01") },
    { from: "EUR", to: "CNY", rate: "7.8234", date: new Date("2026-01-01") },
    { from: "JPY", to: "CNY", rate: "0.04812", date: new Date("2026-01-01") },
    { from: "HKD", to: "CNY", rate: "0.9271", date: new Date("2026-01-01") },
    { from: "GBP", to: "CNY", rate: "9.1245", date: new Date("2026-01-01") },
    // 2026-02-01
    { from: "USD", to: "CNY", rate: "7.2312", date: new Date("2026-02-01") },
    { from: "EUR", to: "CNY", rate: "7.8056", date: new Date("2026-02-01") },
    { from: "JPY", to: "CNY", rate: "0.04798", date: new Date("2026-02-01") },
    { from: "HKD", to: "CNY", rate: "0.9263", date: new Date("2026-02-01") },
    { from: "GBP", to: "CNY", rate: "9.1089", date: new Date("2026-02-01") },
    // 2026-03-01
    { from: "USD", to: "CNY", rate: "7.2198", date: new Date("2026-03-01") },
    { from: "EUR", to: "CNY", rate: "7.7923", date: new Date("2026-03-01") },
    { from: "JPY", to: "CNY", rate: "0.04781", date: new Date("2026-03-01") },
    { from: "HKD", to: "CNY", rate: "0.9254", date: new Date("2026-03-01") },
    { from: "GBP", to: "CNY", rate: "9.0934", date: new Date("2026-03-01") },
  ];
  for (const r of rateData) {
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrency_toCurrency_rateType_effectiveDate: {
          fromCurrency: r.from, toCurrency: r.to,
          rateType: "SPOT", effectiveDate: r.date,
        },
      },
      create: { fromCurrency: r.from, toCurrency: r.to, rate: r.rate, rateType: "SPOT", effectiveDate: r.date, source: "MANUAL" },
      update: { rate: r.rate },
    });
  }

  // ════════════════════════════════════════
  // 3. 组织 & 用户 & 成员
  // ════════════════════════════════════════
  console.log("📌 [3/13] 创建组织、用户...");

  const pw = await bcrypt.hash("Demo@2026!", 12);

  // 检查是否已存在演示组织
  let org = await prisma.organization.findFirst({ where: { slug: "huayue-demo" } });
  if (org) {
    console.log("   ⚠️  演示组织已存在，跳过组织/用户创建（保留现有数据）");
  } else {
    // 创建 5 个用户
    const usersData = [
      { email: "admin@demo.com",      name: "张伟（总监）",   role: "OWNER" as const },
      { email: "finance@demo.com",    name: "李芳（财务总监）", role: "ADMIN" as const },
      { email: "accountant1@demo.com",name: "王敏（会计）",    role: "ACCOUNTANT" as const },
      { email: "accountant2@demo.com",name: "陈刚（会计）",    role: "ACCOUNTANT" as const },
      { email: "auditor@demo.com",    name: "刘洋（审计）",    role: "AUDITOR" as const },
    ];

    const createdUsers: { id: string; email: string; role: string }[] = [];

    org = await prisma.organization.create({
      data: {
        name: "华越科技集团（演示）",
        slug: "huayue-demo",
        description: "用于系统功能演示的测试集团",
      },
    });

    for (const u of usersData) {
      let user = await prisma.user.findUnique({ where: { email: u.email } });
      if (!user) {
        user = await prisma.user.create({ data: { name: u.name, email: u.email, password: pw } });
      }
      await prisma.organizationMember.upsert({
        where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
        create: { organizationId: org.id, userId: user.id, role: u.role },
        update: { role: u.role },
      });
      createdUsers.push({ id: user.id, email: u.email, role: u.role });
    }
    console.log(`   ✅ 组织: ${org.name}，用户: ${usersData.map(u => u.name).join("、")}`);
  }

  // 重新查询所有用户 ID
  const userAdmin      = await prisma.user.findUniqueOrThrow({ where: { email: "admin@demo.com" } });
  const userFinance    = await prisma.user.findUniqueOrThrow({ where: { email: "finance@demo.com" } });
  const userAcc1       = await prisma.user.findUniqueOrThrow({ where: { email: "accountant1@demo.com" } });
  const userAcc2       = await prisma.user.findUniqueOrThrow({ where: { email: "accountant2@demo.com" } });
  // auditor@demo.com 只读，不创建凭证

  // ════════════════════════════════════════
  // 4. 公司（三家）
  // ════════════════════════════════════════
  console.log("📌 [4/13] 创建公司...");

  async function ensureCompany(params: {
    orgId: string; code: string; name: string; legalName: string;
    taxId: string; template: "GENERAL"|"MANUFACTURING"|"SERVICE"|"TRADE";
    industryType: "GENERAL"|"MANUFACTURING"|"SERVICE"|"TRADE";
  }) {
    let company = await prisma.company.findFirst({ where: { organizationId: params.orgId, code: params.code } });
    if (company) return company;

    company = await prisma.company.create({
      data: {
        organizationId: params.orgId,
        code: params.code,
        name: params.name,
        legalName: params.legalName,
        taxId: params.taxId,
        functionalCurrency: "CNY",
        industryType: params.industryType,
        vatType: "GENERAL_TAXPAYER",
        incomeTaxRate: "0.25",
        accountTemplate: params.template,
        surtaxConfig: { urbanMaintenance: 0.07, educationSurcharge: 0.03, localEducation: 0.02 },
      },
    });

    // 2026 会计年度 + 12 期间
    const fy = await prisma.fiscalYear.create({
      data: {
        companyId: company.id,
        year: 2026,
        startDate: new Date("2026-01-01"),
        endDate:   new Date("2026-12-31"),
      },
    });
    const monthNames = ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"];
    for (let i = 1; i <= 12; i++) {
      await prisma.fiscalPeriod.create({
        data: {
          fiscalYearId: fy.id, periodNumber: i,
          name: `2026年${monthNames[i-1]}`,
          startDate: new Date(2026, i-1, 1),
          endDate:   new Date(2026, i, 0),
          status: "OPEN",
        },
      });
    }

    // 科目表
    const accounts = getAccountTemplate(params.template);
    for (const acc of accounts) {
      await prisma.chartOfAccount.create({
        data: {
          companyId: company.id, code: acc.code, name: acc.name,
          accountType: acc.type, normalBalance: acc.normal,
          level: 1, isLeaf: acc.isLeaf, reportCategory: acc.category,
        },
      });
    }
    return company;
  }

  const bjCompany = await ensureCompany({
    orgId: org.id, code: "BJ-001",
    name: "北京华越科技有限公司", legalName: "北京华越科技有限公司",
    taxId: "91110000MA0001BJ01", template: "GENERAL", industryType: "GENERAL",
  });
  const shCompany = await ensureCompany({
    orgId: org.id, code: "SH-001",
    name: "上海华越贸易有限公司", legalName: "上海华越贸易有限公司",
    taxId: "91310000MA0001SH01", template: "TRADE", industryType: "TRADE",
  });
  const szCompany = await ensureCompany({
    orgId: org.id, code: "SZ-001",
    name: "深圳华越制造有限公司", legalName: "深圳华越制造有限公司",
    taxId: "91440300MA0001SZ01", template: "MANUFACTURING", industryType: "MANUFACTURING",
  });
  console.log(`   ✅ 北京总部 / 上海贸易 / 深圳制造`);

  // ════════════════════════════════════════
  // 5. 北京公司追加科目
  // ════════════════════════════════════════
  console.log("📌 [5/13] 追加北京公司额外科目...");
  const extraAccounts = [
    { code: "2211", name: "应付职工薪酬", type: "LIABILITY" as const, normal: "CREDIT" as const, category: "CURRENT_LIABILITY" as const },
    { code: "2001", name: "短期借款",     type: "LIABILITY" as const, normal: "CREDIT" as const, category: "CURRENT_LIABILITY" as const },
    { code: "1131", name: "预付账款",     type: "ASSET"    as const, normal: "DEBIT"  as const, category: "CURRENT_ASSET"    as const },
    { code: "1221", name: "其他应收款",   type: "ASSET"    as const, normal: "DEBIT"  as const, category: "CURRENT_ASSET"    as const },
    { code: "6801", name: "所得税费用",   type: "EXPENSE"  as const, normal: "DEBIT"  as const, category: "INCOME_TAX"       as const },
    { code: "6402", name: "其他业务成本", type: "EXPENSE"  as const, normal: "DEBIT"  as const, category: "OPERATING_COST"   as const },
  ];
  for (const a of extraAccounts) {
    const exists = await prisma.chartOfAccount.findFirst({ where: { companyId: bjCompany.id, code: a.code } });
    if (!exists) {
      await prisma.chartOfAccount.create({
        data: {
          companyId: bjCompany.id, code: a.code, name: a.name,
          accountType: a.type, normalBalance: a.normal,
          level: 1, isLeaf: true, reportCategory: a.category,
        },
      });
    }
  }

  // 获取北京公司所有科目 map
  const bjAccounts = await prisma.chartOfAccount.findMany({ where: { companyId: bjCompany.id } });
  const acc = Object.fromEntries(bjAccounts.map(a => [a.code, a]));

  // 获取北京公司会计期间
  const bjFY = await prisma.fiscalYear.findFirstOrThrow({ where: { companyId: bjCompany.id, year: 2026 } });
  const bjPeriods = await prisma.fiscalPeriod.findMany({
    where: { fiscalYearId: bjFY.id }, orderBy: { periodNumber: "asc" },
  });
  const p1 = bjPeriods[0]; // 1月
  const p2 = bjPeriods[1]; // 2月
  const p3 = bjPeriods[2]; // 3月

  // ════════════════════════════════════════
  // 6. 客户 & 供应商（北京公司）
  // ════════════════════════════════════════
  console.log("📌 [6/13] 创建客户和供应商...");

  async function ensureCustomer(data: Parameters<typeof prisma.customer.create>[0]["data"]) {
    const existing = await prisma.customer.findFirst({
      where: { companyId: data.companyId as string, code: data.code as string },
    });
    return existing ?? await prisma.customer.create({ data });
  }
  async function ensureVendor(data: Parameters<typeof prisma.vendor.create>[0]["data"]) {
    const existing = await prisma.vendor.findFirst({
      where: { companyId: data.companyId as string, code: data.code as string },
    });
    return existing ?? await prisma.vendor.create({ data });
  }

  const custAli = await ensureCustomer({
    companyId: bjCompany.id, code: "C-001", name: "阿里巴巴网络科技有限公司",
    taxId: "91330100717840208D", contactName: "赵明", phone: "0571-88888888",
    email: "ar@alibaba.com", address: "浙江省杭州市余杭区文一西路969号",
    currency: "CNY", creditLimit: "2000000", paymentTerms: "NET_30",
  });
  const custTencent = await ensureCustomer({
    companyId: bjCompany.id, code: "C-002", name: "腾讯科技（深圳）有限公司",
    taxId: "91440300708461136T", contactName: "陈华", phone: "0755-86013388",
    email: "ar@tencent.com", address: "广东省深圳市南山区科技中一路腾讯大厦",
    currency: "CNY", creditLimit: "3000000", paymentTerms: "NET_30",
  });
  const custBytedance = await ensureCustomer({
    companyId: bjCompany.id, code: "C-003", name: "字节跳动有限公司",
    taxId: "91110105MA0001BY01", contactName: "吴涛", phone: "010-65872000",
    email: "ar@bytedance.com", address: "北京市海淀区中关村北四环西路14号",
    currency: "CNY", creditLimit: "1500000", paymentTerms: "NET_60",
  });
  const custApple = await ensureCustomer({
    companyId: bjCompany.id, code: "C-004", name: "Apple (International) Pte Ltd",
    taxId: "US-APPLE-INT-001", contactName: "James Liu", phone: "+65-62700000",
    email: "ar@apple.com", address: "1 Apple Park Way, Cupertino, CA 95014",
    currency: "USD", creditLimit: "500000", paymentTerms: "NET_60",
  });
  const custSamsung = await ensureCustomer({
    companyId: bjCompany.id, code: "C-005", name: "Samsung Electronics Co., Ltd.",
    taxId: "KR-SAMSUNG-001", contactName: "Kim Jinhyun", phone: "+82-2-2255-0114",
    email: "ar@samsung.com", address: "129 Samsung-ro, Yeongtong-gu, Suwon-si, Korea",
    currency: "USD", creditLimit: "800000", paymentTerms: "NET_30",
  });

  const vendorHuawei = await ensureVendor({
    companyId: bjCompany.id, code: "V-001", name: "华为技术有限公司",
    taxId: "914403001922038216", contactName: "孙强", phone: "0755-28780808",
    email: "ap@huawei.com", address: "广东省深圳市龙岗区坂田华为基地",
    currency: "CNY", paymentTerms: "NET_30",
    bankName: "中国建设银行深圳分行", bankAccount: "44050168290052658888",
  });
  const vendorSinopec = await ensureVendor({
    companyId: bjCompany.id, code: "V-002", name: "中国石油化工集团有限公司",
    taxId: "91110000100003348P", contactName: "李建国", phone: "010-59960114",
    email: "ap@sinopec.com", address: "北京市朝阳区朝阳门北大街22号",
    currency: "CNY", paymentTerms: "NET_60",
    bankName: "中国工商银行北京分行", bankAccount: "01090008090018808000",
  });
  const vendorStateGrid = await ensureVendor({
    companyId: bjCompany.id, code: "V-003", name: "国家电网有限公司",
    taxId: "91110000710904030C", contactName: "张志远", phone: "010-66597111",
    email: "ap@sgcc.com.cn", address: "北京市西城区西长安街86号",
    currency: "CNY", paymentTerms: "NET_30",
    bankName: "中国银行北京分行", bankAccount: "01040011090018808888",
  });
  const vendorMicrosoft = await ensureVendor({
    companyId: bjCompany.id, code: "V-004", name: "Microsoft Corporation",
    taxId: "US-MSFT-WA-001", contactName: "David Chen", phone: "+1-425-882-8080",
    email: "ap@microsoft.com", address: "One Microsoft Way, Redmond, WA 98052",
    currency: "USD", paymentTerms: "NET_30",
    bankName: "JP Morgan Chase", bankAccount: "MSFT-USD-001-CHASE",
  });
  const vendorAWS = await ensureVendor({
    companyId: bjCompany.id, code: "V-005", name: "Amazon Web Services, Inc.",
    taxId: "US-AWS-WA-001", contactName: "Sarah Zhang", phone: "+1-206-266-1000",
    email: "billing@aws.amazon.com", address: "410 Terry Ave N, Seattle, WA 98109",
    currency: "USD", paymentTerms: "NET_30",
    bankName: "Bank of America", bankAccount: "AWS-USD-001-BOA",
  });
  console.log(`   ✅ 5 客户 + 5 供应商`);

  // ════════════════════════════════════════
  // 7. 日记账凭证（北京公司，1月~3月）
  // ════════════════════════════════════════
  console.log("📌 [7/13] 创建日记账凭证...");

  // 检查是否已有凭证
  const existingJE = await prisma.journalEntry.findFirst({ where: { companyId: bjCompany.id } });
  if (existingJE) {
    console.log("   ⚠️  凭证已存在，跳过凭证创建");
  } else {
    // ── 辅助函数：创建一条已过账凭证 ──
    async function createPostedJE(params: {
      seq: number;
      periodId: string;
      date: Date;
      description: string;
      reference?: string;
      createdById: string;
      approvedById: string;
      lines: { accountCode: string; dr: number; cr: number; desc?: string; cashFlow?: "OPERATING"|"INVESTING"|"FINANCING" }[];
    }) {
      const totalDr = params.lines.reduce((s, l) => s + l.dr, 0);
      const totalCr = params.lines.reduce((s, l) => s + l.cr, 0);
      const entry = await prisma.journalEntry.create({
        data: {
          companyId: bjCompany.id,
          fiscalPeriodId: params.periodId,
          entryNumber: jeNum(2026, params.seq),
          entryDate: params.date,
          description: params.description,
          reference: params.reference,
          currency: "CNY",
          status: "POSTED",
          totalDebit: totalDr, totalCredit: totalCr, isBalanced: true,
          createdById: params.createdById,
          approvedById: params.approvedById,
          approvedAt: params.date,
          postedAt: params.date,
          lines: {
            create: params.lines.map((l, i) => ({
              lineNumber: i + 1,
              accountId: acc[l.accountCode].id,
              description: l.desc,
              debitAmount: l.dr, creditAmount: l.cr,
              debitAmountLC: l.dr, creditAmountLC: l.cr,
              currency: "CNY", exchangeRate: 1,
              cashFlowActivity: l.cashFlow ?? null,
            })),
          },
        },
      });
      return entry;
    }

    // ═══════════════════════════════
    // 一月（1 ~ 10）POSTED
    // ═══════════════════════════════
    // JE-2026-00001: 股东投入注册资本
    const je1 = await createPostedJE({
      seq: 1, periodId: p1.id, date: new Date("2026-01-02"),
      description: "收到股东投入注册资本",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1002", dr: 10_000_000, cr: 0, desc: "收到注册资本", cashFlow: "FINANCING" },
        { accountCode: "4001", dr: 0, cr: 10_000_000, desc: "实收资本" },
      ],
    });

    // JE-2026-00002: 取得短期银行借款 200万
    const je2 = await createPostedJE({
      seq: 2, periodId: p1.id, date: new Date("2026-01-05"),
      description: "取得工商银行短期借款",
      reference: "借款合同：ICBC-2026-BJ-001",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1002", dr: 2_000_000, cr: 0, desc: "收到借款", cashFlow: "FINANCING" },
        { accountCode: "2001", dr: 0, cr: 2_000_000, desc: "短期借款" },
      ],
    });

    // JE-2026-00003: 购入服务器设备（取得增值税专用发票）
    const je3 = await createPostedJE({
      seq: 3, periodId: p1.id, date: new Date("2026-01-08"),
      description: "购入戴尔服务器设备（含进项税）",
      reference: "发票：44000226001",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1601", dr: 500_000, cr: 0, desc: "固定资产—服务器", cashFlow: "INVESTING" },
        { accountCode: "2221", dr: 65_000,  cr: 0, desc: "进项税额 13%" },
        { accountCode: "1002", dr: 0, cr: 565_000, desc: "银行付款", cashFlow: "INVESTING" },
      ],
    });

    // JE-2026-00004: 赊购第一批库存商品（华为）
    const je4 = await createPostedJE({
      seq: 4, periodId: p1.id, date: new Date("2026-01-10"),
      description: "赊购商品—华为技术（应付账款）",
      reference: "合同号：PO-2026-001",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1405", dr: 300_000, cr: 0, desc: "购入库存商品" },
        { accountCode: "2221", dr: 39_000,  cr: 0, desc: "进项税额 13%" },
        { accountCode: "2202", dr: 0, cr: 339_000, desc: "应付华为货款" },
      ],
    });

    // JE-2026-00005: 赊销第一批商品给阿里巴巴（13% 销项税）
    const je5 = await createPostedJE({
      seq: 5, periodId: p1.id, date: new Date("2026-01-15"),
      description: "销售商品给阿里巴巴网络（应收账款）",
      reference: "销售合同：SO-2026-001",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1122", dr: 339_000, cr: 0, desc: "应收阿里货款" },
        { accountCode: "6001", dr: 0, cr: 300_000, desc: "主营业务收入" },
        { accountCode: "2221", dr: 0, cr: 39_000,  desc: "销项税额 13%" },
      ],
    });

    // JE-2026-00006: 结转第一批销售成本
    const je6 = await createPostedJE({
      seq: 6, periodId: p1.id, date: new Date("2026-01-15"),
      description: "结转主营业务成本（第一批）",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6401", dr: 180_000, cr: 0, desc: "结转成本" },
        { accountCode: "1405", dr: 0, cr: 180_000, desc: "库存商品减少" },
      ],
    });

    // JE-2026-00007: 支付1月管理费用—办公室租金
    const je7 = await createPostedJE({
      seq: 7, periodId: p1.id, date: new Date("2026-01-20"),
      description: "支付1月办公室租金（管理费用）",
      reference: "租房合同：LEASE-BJ-2025-001",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6602", dr: 50_000, cr: 0, desc: "租金费用", cashFlow: "OPERATING" },
        { accountCode: "1002", dr: 0, cr: 50_000, desc: "银行付款", cashFlow: "OPERATING" },
      ],
    });

    // JE-2026-00008: 计提1月管理人员工资
    const je8 = await createPostedJE({
      seq: 8, periodId: p1.id, date: new Date("2026-01-31"),
      description: "计提1月管理人员工资",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6602", dr: 120_000, cr: 0, desc: "工资费用", cashFlow: "OPERATING" },
        { accountCode: "2211", dr: 0, cr: 120_000, desc: "应付职工薪酬" },
      ],
    });

    // JE-2026-00009: 发放1月工资（实发）
    const je9 = await createPostedJE({
      seq: 9, periodId: p1.id, date: new Date("2026-01-31"),
      description: "实际发放1月工资",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "2211", dr: 120_000, cr: 0, desc: "结清工资" },
        { accountCode: "1002", dr: 0, cr: 120_000, desc: "银行转账实发", cashFlow: "OPERATING" },
      ],
    });

    // JE-2026-00010: 计提1月固定资产折旧（服务器 500000/60≈8333，办公用品 100000/60≈1667）
    const je10 = await createPostedJE({
      seq: 10, periodId: p1.id, date: new Date("2026-01-31"),
      description: "计提1月固定资产折旧",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6602", dr: 10_000, cr: 0, desc: "管理设备折旧费", cashFlow: "OPERATING" },
        { accountCode: "1602", dr: 0, cr: 10_000, desc: "累计折旧" },
      ],
    });

    // ═══════════════════════════════
    // 二月（11 ~ 19）POSTED
    // ═══════════════════════════════
    // JE-2026-00011: 收到阿里巴巴货款（核销应收）
    const je11 = await createPostedJE({
      seq: 11, periodId: p2.id, date: new Date("2026-02-05"),
      description: "收到阿里巴巴货款（核销应收账款）",
      reference: "银行回单：202602050001",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1002", dr: 339_000, cr: 0, desc: "收到货款", cashFlow: "OPERATING" },
        { accountCode: "1122", dr: 0, cr: 339_000, desc: "核销应收账款" },
      ],
    });

    // JE-2026-00012: 偿还第一批应付账款（华为）
    const je12 = await createPostedJE({
      seq: 12, periodId: p2.id, date: new Date("2026-02-08"),
      description: "支付华为应付货款",
      reference: "银行回单：202602080002",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "2202", dr: 339_000, cr: 0, desc: "结清应付账款" },
        { accountCode: "1002", dr: 0, cr: 339_000, desc: "银行付款", cashFlow: "OPERATING" },
      ],
    });

    // JE-2026-00013: 赊购第二批商品（中国石化）
    const je13 = await createPostedJE({
      seq: 13, periodId: p2.id, date: new Date("2026-02-10"),
      description: "赊购商品—中国石化（应付账款）",
      reference: "合同号：PO-2026-002",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1405", dr: 400_000, cr: 0, desc: "购入库存商品" },
        { accountCode: "2221", dr: 52_000,  cr: 0, desc: "进项税额 13%" },
        { accountCode: "2202", dr: 0, cr: 452_000, desc: "应付中国石化货款" },
      ],
    });

    // JE-2026-00014: 赊销第二批（腾讯）
    const je14 = await createPostedJE({
      seq: 14, periodId: p2.id, date: new Date("2026-02-15"),
      description: "销售商品给腾讯科技（应收账款）",
      reference: "销售合同：SO-2026-002",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1122", dr: 565_000, cr: 0, desc: "应收腾讯货款" },
        { accountCode: "6001", dr: 0, cr: 500_000, desc: "主营业务收入" },
        { accountCode: "2221", dr: 0, cr: 65_000,  desc: "销项税额 13%" },
      ],
    });

    // JE-2026-00015: 结转第二批销售成本
    const je15 = await createPostedJE({
      seq: 15, periodId: p2.id, date: new Date("2026-02-15"),
      description: "结转主营业务成本（第二批）",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6401", dr: 240_000, cr: 0, desc: "结转成本" },
        { accountCode: "1405", dr: 0, cr: 240_000, desc: "库存商品减少" },
      ],
    });

    // JE-2026-00016: 支付销售广告费
    const je16 = await createPostedJE({
      seq: 16, periodId: p2.id, date: new Date("2026-02-18"),
      description: "支付2月销售广告推广费",
      reference: "合同号：ADV-2026-001",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6601", dr: 80_000, cr: 0, desc: "广告费", cashFlow: "OPERATING" },
        { accountCode: "1002", dr: 0, cr: 80_000, desc: "银行付款", cashFlow: "OPERATING" },
      ],
    });

    // JE-2026-00017: 计提2月管理人员工资
    const je17 = await createPostedJE({
      seq: 17, periodId: p2.id, date: new Date("2026-02-28"),
      description: "计提2月管理人员工资",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6602", dr: 120_000, cr: 0, desc: "工资费用", cashFlow: "OPERATING" },
        { accountCode: "2211", dr: 0, cr: 120_000, desc: "应付职工薪酬" },
      ],
    });

    // JE-2026-00018: 发放2月工资
    const je18 = await createPostedJE({
      seq: 18, periodId: p2.id, date: new Date("2026-02-28"),
      description: "实际发放2月工资",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "2211", dr: 120_000, cr: 0, desc: "结清工资" },
        { accountCode: "1002", dr: 0, cr: 120_000, desc: "银行转账实发", cashFlow: "OPERATING" },
      ],
    });

    // JE-2026-00019: 计提2月折旧
    const je19 = await createPostedJE({
      seq: 19, periodId: p2.id, date: new Date("2026-02-28"),
      description: "计提2月固定资产折旧",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6602", dr: 12_500, cr: 0, desc: "折旧费（服务器+笔记本+家具+车辆）", cashFlow: "OPERATING" },
        { accountCode: "1602", dr: 0, cr: 12_500, desc: "累计折旧" },
      ],
    });

    // JE-2026-00020: 计提2月财务费用（借款利息）
    const je20 = await createPostedJE({
      seq: 20, periodId: p2.id, date: new Date("2026-02-28"),
      description: "计提短期借款利息（年利率4.5%）",
      reference: "借款合同：ICBC-2026-BJ-001",
      createdById: userAcc2.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6603", dr: 7_500, cr: 0, desc: "利息费用 200万×4.5%÷12≈7500", cashFlow: "OPERATING" },
        { accountCode: "2241", dr: 0, cr: 7_500, desc: "应计利息" },
      ],
    });

    // ═══════════════════════════════
    // 三月（21 ~ 26）混合状态
    // ═══════════════════════════════
    // JE-2026-00021: 赊销第三批（字节跳动）POSTED
    const je21 = await createPostedJE({
      seq: 21, periodId: p3.id, date: new Date("2026-03-05"),
      description: "销售商品给字节跳动（应收账款）",
      reference: "销售合同：SO-2026-003",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "1122", dr: 226_000, cr: 0, desc: "应收字节货款" },
        { accountCode: "6001", dr: 0, cr: 200_000, desc: "主营业务收入" },
        { accountCode: "2221", dr: 0, cr: 26_000,  desc: "销项税额 13%" },
      ],
    });

    // JE-2026-00022: 结转第三批成本 POSTED
    const je22 = await createPostedJE({
      seq: 22, periodId: p3.id, date: new Date("2026-03-05"),
      description: "结转主营业务成本（第三批）",
      createdById: userAcc1.id, approvedById: userFinance.id,
      lines: [
        { accountCode: "6401", dr: 120_000, cr: 0, desc: "结转成本" },
        { accountCode: "1405", dr: 0, cr: 120_000, desc: "库存商品减少" },
      ],
    });

    // JE-2026-00023: 计提3月工资 PENDING_APPROVAL
    const totalDr23 = 120_000;
    const je23 = await prisma.journalEntry.create({
      data: {
        companyId: bjCompany.id, fiscalPeriodId: p3.id,
        entryNumber: jeNum(2026, 23),
        entryDate: new Date("2026-03-31"),
        description: "计提3月管理人员工资",
        currency: "CNY", status: "PENDING_APPROVAL",
        totalDebit: totalDr23, totalCredit: totalDr23, isBalanced: true,
        createdById: userAcc1.id,
        lines: {
          create: [
            { lineNumber: 1, accountId: acc["6602"].id, description: "工资费用", debitAmount: 120_000, creditAmount: 0, debitAmountLC: 120_000, creditAmountLC: 0, currency: "CNY", exchangeRate: 1 },
            { lineNumber: 2, accountId: acc["2211"].id, description: "应付职工薪酬", debitAmount: 0, creditAmount: 120_000, debitAmountLC: 0, creditAmountLC: 120_000, currency: "CNY", exchangeRate: 1 },
          ],
        },
      },
    });

    // JE-2026-00024: 支付差旅费 PENDING_APPROVAL
    const je24 = await prisma.journalEntry.create({
      data: {
        companyId: bjCompany.id, fiscalPeriodId: p3.id,
        entryNumber: jeNum(2026, 24),
        entryDate: new Date("2026-03-12"),
        description: "报销销售部差旅费",
        currency: "CNY", status: "PENDING_APPROVAL",
        totalDebit: 18_000, totalCredit: 18_000, isBalanced: true,
        createdById: userAcc2.id,
        lines: {
          create: [
            { lineNumber: 1, accountId: acc["6601"].id, description: "差旅费", debitAmount: 18_000, creditAmount: 0, debitAmountLC: 18_000, creditAmountLC: 0, currency: "CNY", exchangeRate: 1 },
            { lineNumber: 2, accountId: acc["1002"].id, description: "银行付款", debitAmount: 0, creditAmount: 18_000, debitAmountLC: 0, creditAmountLC: 18_000, currency: "CNY", exchangeRate: 1 },
          ],
        },
      },
    });

    // JE-2026-00025: 计提3月折旧 APPROVED
    const je25 = await prisma.journalEntry.create({
      data: {
        companyId: bjCompany.id, fiscalPeriodId: p3.id,
        entryNumber: jeNum(2026, 25),
        entryDate: new Date("2026-03-31"),
        description: "计提3月固定资产折旧",
        currency: "CNY", status: "APPROVED",
        totalDebit: 12_500, totalCredit: 12_500, isBalanced: true,
        createdById: userAcc2.id,
        approvedById: userFinance.id,
        approvedAt: new Date("2026-03-31"),
        lines: {
          create: [
            { lineNumber: 1, accountId: acc["6602"].id, description: "折旧费用", debitAmount: 12_500, creditAmount: 0, debitAmountLC: 12_500, creditAmountLC: 0, currency: "CNY", exchangeRate: 1 },
            { lineNumber: 2, accountId: acc["1602"].id, description: "累计折旧", debitAmount: 0, creditAmount: 12_500, debitAmountLC: 0, creditAmountLC: 12_500, currency: "CNY", exchangeRate: 1 },
          ],
        },
      },
    });

    // JE-2026-00026: 支付3月财务费用 DRAFT
    const je26 = await prisma.journalEntry.create({
      data: {
        companyId: bjCompany.id, fiscalPeriodId: p3.id,
        entryNumber: jeNum(2026, 26),
        entryDate: new Date("2026-03-31"),
        description: "计提3月借款利息（草稿）",
        currency: "CNY", status: "DRAFT",
        totalDebit: 7_500, totalCredit: 7_500, isBalanced: true,
        createdById: userAcc1.id,
        lines: {
          create: [
            { lineNumber: 1, accountId: acc["6603"].id, description: "利息费用", debitAmount: 7_500, creditAmount: 0, debitAmountLC: 7_500, creditAmountLC: 0, currency: "CNY", exchangeRate: 1 },
            { lineNumber: 2, accountId: acc["2241"].id, description: "应计利息", debitAmount: 0, creditAmount: 7_500, debitAmountLC: 0, creditAmountLC: 7_500, currency: "CNY", exchangeRate: 1 },
          ],
        },
      },
    });

    console.log(`   ✅ 26 条凭证（1月10条 POSTED，2月10条 POSTED，3月6条混合状态）`);
  }

  // ════════════════════════════════════════
  // 8. 应收发票（AR Invoice）+ 核销
  // ════════════════════════════════════════
  console.log("📌 [8/13] 创建应收发票...");
  const existAR = await prisma.aRInvoice.findFirst({ where: { companyId: bjCompany.id } });
  if (existAR) {
    console.log("   ⚠️  AR发票已存在，跳过");
  } else {
    // 查询凭证 & 凭证行
    const je5db = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 5) } });
    const je11db = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 11) } });
    const je14db = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 14) } });
    const je21db = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 21) } });

    // 找到收款凭证行（JE11: 银行存款借方行）
    const je11CrLine = await prisma.journalEntryLine.findFirstOrThrow({
      where: { journalEntryId: je11db.id, accountId: acc["1122"].id },
    });
    const je14DrLine = await prisma.journalEntryLine.findFirstOrThrow({
      where: { journalEntryId: je14db.id, accountId: acc["1122"].id },
    });

    // AR-2026-00001: 阿里巴巴 PAID
    const ar1 = await prisma.aRInvoice.create({
      data: {
        companyId: bjCompany.id, customerId: custAli.id,
        invoiceNumber: arNum(2026, 1),
        invoiceDate: new Date("2026-01-15"), dueDate: new Date("2026-02-14"),
        currency: "CNY", exchangeRate: 1,
        subtotal: 300_000, taxAmount: 39_000, totalAmount: 339_000,
        paidAmount: 339_000, status: "PAID",
        description: "销售商品（第一批）",
        journalEntryId: je5db.id, fiscalPeriodId: p1.id,
      },
    });
    // 核销记录
    await prisma.aRMatching.create({
      data: {
        arInvoiceId: ar1.id, journalEntryLineId: je11CrLine.id,
        matchedAmount: 339_000, matchedDate: new Date("2026-02-05"),
        notes: "全额收款核销",
      },
    });

    // AR-2026-00002: 腾讯 OPEN
    const ar2 = await prisma.aRInvoice.create({
      data: {
        companyId: bjCompany.id, customerId: custTencent.id,
        invoiceNumber: arNum(2026, 2),
        invoiceDate: new Date("2026-02-15"), dueDate: new Date("2026-03-17"),
        currency: "CNY", exchangeRate: 1,
        subtotal: 500_000, taxAmount: 65_000, totalAmount: 565_000,
        paidAmount: 0, status: "OPEN",
        description: "销售商品（第二批）",
        journalEntryId: je14db.id, fiscalPeriodId: p2.id,
      },
    });

    // AR-2026-00003: 字节跳动 OVERDUE（到期日已过）
    const ar3 = await prisma.aRInvoice.create({
      data: {
        companyId: bjCompany.id, customerId: custBytedance.id,
        invoiceNumber: arNum(2026, 3),
        invoiceDate: new Date("2026-03-05"), dueDate: new Date("2026-03-10"),
        currency: "CNY", exchangeRate: 1,
        subtotal: 200_000, taxAmount: 26_000, totalAmount: 226_000,
        paidAmount: 0, status: "OVERDUE",
        description: "销售商品（第三批）",
        journalEntryId: je21db.id, fiscalPeriodId: p3.id,
      },
    });

    // AR-2026-00004: Apple USD PARTIAL（部分收款）
    const ar4 = await prisma.aRInvoice.create({
      data: {
        companyId: bjCompany.id, customerId: custApple.id,
        invoiceNumber: arNum(2026, 4),
        invoiceDate: new Date("2026-02-20"), dueDate: new Date("2026-04-21"),
        currency: "USD", exchangeRate: "7.2312",
        subtotal: "44247.79", taxAmount: "5752.21", totalAmount: "50000.00",
        paidAmount: "20000.00", status: "PARTIAL",
        description: "IT服务费（USD）",
        fiscalPeriodId: p2.id,
      },
    });

    // AR-2026-00005: Samsung USD DRAFT
    const ar5 = await prisma.aRInvoice.create({
      data: {
        companyId: bjCompany.id, customerId: custSamsung.id,
        invoiceNumber: arNum(2026, 5),
        invoiceDate: new Date("2026-03-15"), dueDate: new Date("2026-04-14"),
        currency: "USD", exchangeRate: "7.2198",
        subtotal: "35398.23", taxAmount: "4601.77", totalAmount: "40000.00",
        paidAmount: 0, status: "DRAFT",
        description: "技术顾问服务费（USD）",
        fiscalPeriodId: p3.id,
      },
    });
    console.log(`   ✅ 5 条AR发票（PAID/OPEN/OVERDUE/PARTIAL/DRAFT）`);
  }

  // ════════════════════════════════════════
  // 9. 应付发票（AP Invoice）+ 核销
  // ════════════════════════════════════════
  console.log("📌 [9/13] 创建应付发票...");
  const existAP = await prisma.aPInvoice.findFirst({ where: { companyId: bjCompany.id } });
  if (existAP) {
    console.log("   ⚠️  AP发票已存在，跳过");
  } else {
    const je4db  = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 4) } });
    const je12db = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 12) } });
    const je13db = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 13) } });

    const je12DrLine = await prisma.journalEntryLine.findFirstOrThrow({
      where: { journalEntryId: je12db.id, accountId: acc["2202"].id },
    });

    // AP-2026-00001: 华为 PAID
    const ap1 = await prisma.aPInvoice.create({
      data: {
        companyId: bjCompany.id, vendorId: vendorHuawei.id,
        invoiceNumber: apNum(2026, 1),
        invoiceDate: new Date("2026-01-10"), dueDate: new Date("2026-02-09"),
        currency: "CNY", exchangeRate: 1,
        subtotal: 300_000, taxAmount: 39_000, totalAmount: 339_000,
        paidAmount: 339_000, status: "PAID",
        description: "采购商品（第一批）",
        journalEntryId: je4db.id, fiscalPeriodId: p1.id,
      },
    });
    await prisma.aPMatching.create({
      data: {
        apInvoiceId: ap1.id, journalEntryLineId: je12DrLine.id,
        matchedAmount: 339_000, matchedDate: new Date("2026-02-08"),
        notes: "全额付款核销",
      },
    });

    // AP-2026-00002: 中国石化 OPEN
    const ap2 = await prisma.aPInvoice.create({
      data: {
        companyId: bjCompany.id, vendorId: vendorSinopec.id,
        invoiceNumber: apNum(2026, 2),
        invoiceDate: new Date("2026-02-10"), dueDate: new Date("2026-04-11"),
        currency: "CNY", exchangeRate: 1,
        subtotal: 400_000, taxAmount: 52_000, totalAmount: 452_000,
        paidAmount: 0, status: "OPEN",
        description: "采购商品（第二批）",
        journalEntryId: je13db.id, fiscalPeriodId: p2.id,
      },
    });

    // AP-2026-00003: 国家电网 OPEN（水电费）
    const ap3 = await prisma.aPInvoice.create({
      data: {
        companyId: bjCompany.id, vendorId: vendorStateGrid.id,
        invoiceNumber: apNum(2026, 3),
        invoiceDate: new Date("2026-03-01"), dueDate: new Date("2026-03-31"),
        currency: "CNY", exchangeRate: 1,
        subtotal: 25_000, taxAmount: 1_500, totalAmount: 26_500,
        paidAmount: 0, status: "OPEN",
        description: "1-2月水电费",
        fiscalPeriodId: p3.id,
      },
    });

    // AP-2026-00004: Microsoft USD OPEN
    const ap4 = await prisma.aPInvoice.create({
      data: {
        companyId: bjCompany.id, vendorId: vendorMicrosoft.id,
        invoiceNumber: apNum(2026, 4),
        invoiceDate: new Date("2026-03-10"), dueDate: new Date("2026-04-09"),
        currency: "USD", exchangeRate: "7.2198",
        subtotal: "17699.12", taxAmount: "2300.88", totalAmount: "20000.00",
        paidAmount: 0, status: "OPEN",
        description: "Microsoft 365年度授权费",
        fiscalPeriodId: p3.id,
      },
    });

    // AP-2026-00005: AWS USD DRAFT
    const ap5 = await prisma.aPInvoice.create({
      data: {
        companyId: bjCompany.id, vendorId: vendorAWS.id,
        invoiceNumber: apNum(2026, 5),
        invoiceDate: new Date("2026-03-15"), dueDate: new Date("2026-04-14"),
        currency: "USD", exchangeRate: "7.2198",
        subtotal: "8849.56", taxAmount: "1150.44", totalAmount: "10000.00",
        paidAmount: 0, status: "DRAFT",
        description: "AWS云服务月费（3月）",
        fiscalPeriodId: p3.id,
      },
    });
    console.log(`   ✅ 5 条AP发票（PAID/OPEN/OPEN/OPEN/DRAFT）`);
  }

  // ════════════════════════════════════════
  // 10. 固定资产 + 折旧记录
  // ════════════════════════════════════════
  console.log("📌 [10/13] 创建固定资产及折旧记录...");
  const existFA = await prisma.fixedAsset.findFirst({ where: { companyId: bjCompany.id } });
  if (existFA) {
    console.log("   ⚠️  固定资产已存在，跳过");
  } else {
    const acct1601 = acc["1601"];
    const acct1602 = acc["1602"];
    const acct6602 = acc["6602"];

    // 查询关联凭证（服务器采购凭证 JE3）
    const je3db = await prisma.journalEntry.findFirstOrThrow({ where: { companyId: bjCompany.id, entryNumber: jeNum(2026, 3) } });

    const assetsData = [
      {
        num: 1, name: "联想ThinkPad E14笔记本电脑（5台）",
        category: "ELECTRONICS" as const, dept: "行政管理部", loc: "北京总部办公室",
        serial: "LN-THINKPAD-E14-BJ-001-005",
        acqDate: new Date("2026-01-05"), acqCost: 100_000,
        residualRate: 0.05, usefulLife: 60,
        method: "STRAIGHT_LINE" as const,
        // 直线法: 100000 * (1-0.05) / 60 = 1583.33/月
        monthlyDep: 1583.33,
        journalEntryId: null as string | null,
      },
      {
        num: 2, name: "戴尔PowerEdge R750服务器（2台）",
        category: "ELECTRONICS" as const, dept: "IT基础设施部", loc: "北京机房",
        serial: "DELL-PE-R750-BJ-001-002",
        acqDate: new Date("2026-01-08"), acqCost: 500_000,
        residualRate: 0.05, usefulLife: 60,
        method: "STRAIGHT_LINE" as const,
        // 500000 * (1-0.05) / 60 = 7916.67/月
        monthlyDep: 7916.67,
        journalEntryId: je3db.id,
      },
      {
        num: 3, name: "办公家具套装（会议室+接待区）",
        category: "OFFICE_FURNITURE" as const, dept: "行政管理部", loc: "北京总部办公室",
        serial: null,
        acqDate: new Date("2026-01-10"), acqCost: 80_000,
        residualRate: 0.00, usefulLife: 120,
        method: "STRAIGHT_LINE" as const,
        // 80000 * 1.00 / 120 = 666.67/月
        monthlyDep: 666.67,
        journalEntryId: null as string | null,
      },
      {
        num: 4, name: "本田雅阁公务车（2辆）",
        category: "VEHICLES" as const, dept: "行政管理部", loc: "北京总部地库",
        serial: "HONDA-ACCORD-BJ-A001 / BJ-A002",
        acqDate: new Date("2026-01-15"), acqCost: 350_000,
        residualRate: 0.05, usefulLife: 60,
        method: "DECLINING_BALANCE" as const,
        // 双倍余额递减: 350000 * (2/5) / 12 = 11666.67/月 (第一年)
        monthlyDep: 11666.67,
        journalEntryId: null as string | null,
      },
    ];

    for (const a of assetsData) {
      // 建资产记录
      const asset = await prisma.fixedAsset.create({
        data: {
          companyId: bjCompany.id,
          assetNumber: faNum(2026, a.num),
          name: a.name, category: a.category,
          department: a.dept, location: a.loc,
          serialNumber: a.serial,
          acquisitionDate: a.acqDate, acquisitionCost: a.acqCost,
          residualRate: a.residualRate, usefulLifeMonths: a.usefulLife,
          depreciationMethod: a.method,
          accumulatedDepreciation: 0, status: "ACTIVE",
          costAccountId: acct1601.id,
          accDepAccountId: acct1602.id,
          depExpAccountId: acct6602.id,
          journalEntryId: a.journalEntryId,
        },
      });

      // 1月折旧记录
      await prisma.depreciationRecord.create({
        data: {
          assetId: asset.id, fiscalPeriodId: p1.id,
          amount: parseFloat(a.monthlyDep.toFixed(2)),
          notes: `${a.method === "DECLINING_BALANCE" ? "双倍余额递减法" : "直线法"}月度折旧`,
        },
      });

      // 2月折旧记录
      let monthlyDep2 = a.monthlyDep;
      if (a.method === "DECLINING_BALANCE") {
        // 期末账面净值 = 350000 - 11666.67 = 338333.33，下月 = 338333.33 * (2/5)/12
        const netBook1 = a.acqCost - a.monthlyDep;
        monthlyDep2 = netBook1 * (2 / 5) / 12;
      }
      await prisma.depreciationRecord.create({
        data: {
          assetId: asset.id, fiscalPeriodId: p2.id,
          amount: parseFloat(monthlyDep2.toFixed(2)),
          notes: "月度折旧",
        },
      });

      // 更新累计折旧（1月+2月）
      await prisma.fixedAsset.update({
        where: { id: asset.id },
        data: { accumulatedDepreciation: parseFloat((a.monthlyDep + monthlyDep2).toFixed(2)) },
      });
    }
    console.log(`   ✅ 4 项固定资产 + 8 条折旧记录（1月&2月各4条）`);
  }

  // ════════════════════════════════════════
  // 11. 增值税配置 + 增值税台账
  // ════════════════════════════════════════
  console.log("📌 [11/13] 创建增值税配置和台账...");
  const existVAT = await prisma.vATConfig.findFirst({ where: { companyId: bjCompany.id } });
  if (existVAT) {
    console.log("   ⚠️  增值税配置已存在，跳过");
  } else {
    await prisma.vATConfig.create({
      data: {
        companyId: bjCompany.id,
        taxpayerType: "GENERAL_TAXPAYER",
        standardRate: "0.13",
        reducedRates: [0.09, 0.06, 0.03, 0.01],
        urbanMaintenanceRate: "0.07",
        educationSurcharge: "0.03",
        localEducation: "0.02",
      },
    });

    const vatRecords = [
      // 销项（一月）
      { period: p1.id, dir: "SALES" as const, type: "SPECIAL_VAT" as const, invNum: "SINV-2026-001", date: new Date("2026-01-15"), counterparty: "阿里巴巴网络科技有限公司", cTaxId: "91330100717840208D", amount: 300_000, rate: 0.13, tax: 39_000, deductible: false },
      // 进项（一月—商品采购）
      { period: p1.id, dir: "PURCHASE" as const, type: "SPECIAL_VAT" as const, invNum: "PINV-2026-001", date: new Date("2026-01-10"), counterparty: "华为技术有限公司", cTaxId: "914403001922038216", amount: 300_000, rate: 0.13, tax: 39_000, deductible: true },
      // 进项（一月—固定资产）
      { period: p1.id, dir: "PURCHASE" as const, type: "SPECIAL_VAT" as const, invNum: "PINV-2026-002", date: new Date("2026-01-08"), counterparty: "戴尔（中国）有限公司", cTaxId: "91110000600005547H", amount: 500_000, rate: 0.13, tax: 65_000, deductible: true },
      // 销项（二月）
      { period: p2.id, dir: "SALES" as const, type: "SPECIAL_VAT" as const, invNum: "SINV-2026-002", date: new Date("2026-02-15"), counterparty: "腾讯科技（深圳）有限公司", cTaxId: "91440300708461136T", amount: 500_000, rate: 0.13, tax: 65_000, deductible: false },
      // 进项（二月）
      { period: p2.id, dir: "PURCHASE" as const, type: "SPECIAL_VAT" as const, invNum: "PINV-2026-003", date: new Date("2026-02-10"), counterparty: "中国石油化工集团有限公司", cTaxId: "91110000100003348P", amount: 400_000, rate: 0.13, tax: 52_000, deductible: true },
      // 销项（三月）
      { period: p3.id, dir: "SALES" as const, type: "SPECIAL_VAT" as const, invNum: "SINV-2026-003", date: new Date("2026-03-05"), counterparty: "字节跳动有限公司", cTaxId: "91110105MA0001BY01", amount: 200_000, rate: 0.13, tax: 26_000, deductible: false },
      // 进项（三月—水电）
      { period: p3.id, dir: "PURCHASE" as const, type: "GENERAL_VAT" as const, invNum: "PINV-2026-004", date: new Date("2026-03-01"), counterparty: "国家电网有限公司", cTaxId: "91110000710904030C", amount: 25_000, rate: 0.06, tax: 1_500, deductible: false },
    ];

    for (const r of vatRecords) {
      await prisma.vATRecord.create({
        data: {
          companyId: bjCompany.id, fiscalPeriodId: r.period,
          direction: r.dir, invoiceType: r.type,
          invoiceNumber: r.invNum, invoiceDate: r.date,
          counterparty: r.counterparty, counterpartyTaxId: r.cTaxId,
          amount: r.amount, taxRate: r.rate, taxAmount: r.tax, deductible: r.deductible,
        },
      });
    }
    console.log(`   ✅ VAT配置 + 7 条增值税台账（3期进销项）`);
  }

  // ════════════════════════════════════════
  // 12. 凭证模板（北京/上海/深圳各一套）
  // ════════════════════════════════════════
  console.log("📌 [12/13] 创建凭证模板...");
  for (const company of [bjCompany, shCompany, szCompany]) {
    const existTpl = await prisma.journalTemplate.findFirst({ where: { companyId: company.id } });
    if (existTpl) continue;
    for (const tpl of BUILT_IN_TEMPLATES) {
      const template = await prisma.journalTemplate.create({
        data: {
          companyId: company.id, name: tpl.name, description: tpl.description,
          category: tpl.category, isSystem: true, isActive: true, sortOrder: tpl.sortOrder,
        },
      });
      for (const line of tpl.lines) {
        await prisma.journalTemplateLine.create({
          data: {
            templateId: template.id, lineNumber: line.lineNumber,
            accountCode: line.accountCode, accountName: line.accountName,
            direction: line.direction, description: line.description,
          },
        });
      }
    }
  }
  console.log(`   ✅ 三家公司各 ${BUILT_IN_TEMPLATES.length} 条内置凭证模板`);

  // ════════════════════════════════════════
  // 13. 合并报表组 + 集团科目表
  // ════════════════════════════════════════
  console.log("📌 [13/13] 创建合并报表组和集团科目...");
  const existCG = await prisma.consolidationGroup.findFirst({ where: { organizationId: org.id } });
  if (existCG) {
    console.log("   ⚠️  合并报表组已存在，跳过");
  } else {
    const cg = await prisma.consolidationGroup.create({
      data: {
        organizationId: org.id,
        name: "华越科技集团合并报表 2026",
        description: "含北京、上海、深圳三家子公司的合并财务报表",
        reportingCurrency: "CNY",
      },
    });

    await prisma.consolidationMember.createMany({
      data: [
        { groupId: cg.id, companyId: bjCompany.id, memberType: "PARENT",     ownershipPct: "1.0000", consolidationMethod: "FULL", sortOrder: 1 },
        { groupId: cg.id, companyId: shCompany.id, memberType: "SUBSIDIARY", ownershipPct: "1.0000", consolidationMethod: "FULL", sortOrder: 2 },
        { groupId: cg.id, companyId: szCompany.id, memberType: "SUBSIDIARY", ownershipPct: "0.8000", consolidationMethod: "FULL", sortOrder: 3 },
      ],
    });

    // 集团科目表（简化）
    const groupAccs = [
      { code: "1000", name: "流动资产",     type: "ASSET"     as const, normal: "DEBIT"  as const, isLeaf: false, rc: "CURRENT_ASSET"     as const },
      { code: "1001", name: "货币资金",     type: "ASSET"     as const, normal: "DEBIT"  as const, isLeaf: true,  rc: "CURRENT_ASSET"     as const },
      { code: "1100", name: "应收款项",     type: "ASSET"     as const, normal: "DEBIT"  as const, isLeaf: true,  rc: "CURRENT_ASSET"     as const },
      { code: "1400", name: "存货",         type: "ASSET"     as const, normal: "DEBIT"  as const, isLeaf: true,  rc: "CURRENT_ASSET"     as const },
      { code: "1600", name: "非流动资产",   type: "ASSET"     as const, normal: "DEBIT"  as const, isLeaf: false, rc: "NON_CURRENT_ASSET" as const },
      { code: "1601", name: "固定资产净值", type: "ASSET"     as const, normal: "DEBIT"  as const, isLeaf: true,  rc: "NON_CURRENT_ASSET" as const },
      { code: "2000", name: "流动负债",     type: "LIABILITY" as const, normal: "CREDIT" as const, isLeaf: false, rc: "CURRENT_LIABILITY" as const },
      { code: "2200", name: "应付款项",     type: "LIABILITY" as const, normal: "CREDIT" as const, isLeaf: true,  rc: "CURRENT_LIABILITY" as const },
      { code: "4000", name: "所有者权益",   type: "EQUITY"    as const, normal: "CREDIT" as const, isLeaf: false, rc: "EQUITY_ITEM"       as const },
      { code: "4001", name: "实收资本",     type: "EQUITY"    as const, normal: "CREDIT" as const, isLeaf: true,  rc: "EQUITY_ITEM"       as const },
      { code: "6000", name: "营业收入",     type: "REVENUE"   as const, normal: "CREDIT" as const, isLeaf: true,  rc: "OPERATING_REVENUE" as const },
      { code: "6400", name: "营业成本",     type: "EXPENSE"   as const, normal: "DEBIT"  as const, isLeaf: true,  rc: "OPERATING_COST"    as const },
      { code: "6600", name: "期间费用",     type: "EXPENSE"   as const, normal: "DEBIT"  as const, isLeaf: true,  rc: "PERIOD_EXPENSE"    as const },
    ];

    // 找父节点
    const gaMap: Record<string, string> = {};
    for (const ga of groupAccs) {
      const created = await prisma.groupAccount.create({
        data: {
          organizationId: org.id, code: ga.code, name: ga.name,
          accountType: ga.type, normalBalance: ga.normal,
          level: ga.isLeaf ? 2 : 1, isLeaf: ga.isLeaf,
          reportCategory: ga.rc,
          parentId: ga.code === "1001" || ga.code === "1100" || ga.code === "1400" ? gaMap["1000"]
            : ga.code === "1601" ? gaMap["1600"]
            : ga.code === "2200" ? gaMap["2000"]
            : ga.code === "4001" ? gaMap["4000"]
            : undefined,
        },
      });
      gaMap[ga.code] = created.id;
    }

    // 集团科目映射（北京公司）
    const mappings = [
      { groupCode: "1001", localCode: "1002" }, // 银行存款→货币资金
      { groupCode: "1001", localCode: "1001" }, // 库存现金→货币资金
      { groupCode: "1100", localCode: "1122" }, // 应收账款
      { groupCode: "1400", localCode: "1405" }, // 库存商品
      { groupCode: "1601", localCode: "1601" }, // 固定资产
      { groupCode: "2200", localCode: "2202" }, // 应付账款
      { groupCode: "4001", localCode: "4001" }, // 实收资本
      { groupCode: "6000", localCode: "6001" }, // 主营业务收入
      { groupCode: "6400", localCode: "6401" }, // 主营业务成本
      { groupCode: "6600", localCode: "6601" }, // 销售费用
      { groupCode: "6600", localCode: "6602" }, // 管理费用
      { groupCode: "6600", localCode: "6603" }, // 财务费用
    ];

    for (const m of mappings) {
      const gaId = gaMap[m.groupCode];
      if (!gaId) continue;
      await prisma.groupAccountMapping.create({
        data: {
          groupAccountId: gaId, companyId: bjCompany.id,
          mappingType: "DIRECT", localCode: m.localCode, priority: 0,
        },
      });
    }
    console.log(`   ✅ 合并报表组（3家公司）+ ${groupAccs.length} 个集团科目 + 北京公司科目映射`);
  }

  // ════════════════════════════════════════
  // 关闭1月、2月期间（模拟真实业务状态）
  // ════════════════════════════════════════
  console.log("\n🔒 关闭1月和2月期间...");
  await prisma.fiscalPeriod.update({
    where: { id: p1.id },
    data: { status: "CLOSED", closedAt: new Date("2026-02-03") },
  });
  await prisma.fiscalPeriod.update({
    where: { id: p2.id },
    data: { status: "CLOSED", closedAt: new Date("2026-03-04") },
  });
  console.log("   ✅ 1月、2月已关闭，3月保持OPEN");

  // ════════════════════════════════════════
  // 汇总输出
  // ════════════════════════════════════════
  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║         演示数据初始化完成 ✅                      ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║  组织：华越科技集团（演示）                         ║");
  console.log("║  公司：北京总部 / 上海贸易 / 深圳制造               ║");
  console.log("║  用户：5 个（OWNER/ADMIN/ACCOUNTANT×2/AUDITOR）   ║");
  console.log("║  货币：6 种 + 15 条汇率                             ║");
  console.log("║  客户：5 个（含 2 个外币客户）                      ║");
  console.log("║  供应商：5 个（含 2 个外币供应商）                  ║");
  console.log("║  凭证：26 条（POSTED/APPROVED/PENDING/DRAFT）     ║");
  console.log("║  AR发票：5 张（PAID/OPEN/OVERDUE/PARTIAL/DRAFT） ║");
  console.log("║  AP发票：5 张（PAID/OPEN×3/DRAFT）               ║");
  console.log("║  固定资产：4 项 + 8 条折旧记录                     ║");
  console.log("║  增值税台账：7 条（1-3月进销项）                   ║");
  console.log(`║  凭证模板：${BUILT_IN_TEMPLATES.length} 个×3家公司                         ║`);
  console.log("║  合并报表组：1 个 + 集团科目 13 个                 ║");
  console.log("║  期间状态：1-2月已关闭，3月开放                    ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║  登录账号：admin@demo.com / Demo@2026!            ║");
  console.log("║           finance@demo.com / Demo@2026!           ║");
  console.log("║           accountant1@demo.com / Demo@2026!       ║");
  console.log("╚══════════════════════════════════════════════════╝");
}

main()
  .catch((e) => { console.error("❌ 种子脚本失败:", e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
