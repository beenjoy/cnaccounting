# CNAccounting — 多公司多货币企业财务系统

面向**跨国企业集团**的全功能财务会计管理系统，严格遵循**中国企业会计准则（CAS）**，支持多公司、多货币核算，适用于在多个国家和地区设有子公司的集团企业。

---

## 功能概览

### 核心会计
- **日记账凭证**：多步骤审批流程（草稿 → 提交 → 审批 → 过账），借贷平衡校验，支持多货币录入，凭证冲销
- **科目表管理**：多级科目层级，遵循财政部统一规范（资产/负债/所有者权益/收入/费用），末级科目限制
- **会计期间管理**：12个月度期间，支持开放/关闭/软关闭/重开（含审批原因），年末结账

### 财务报表（遵循 CAS 30/31/33）
| 报表 | 准则 | 说明 |
|------|------|------|
| 试算平衡表 | — | 期末借贷合计校验 |
| 资产负债表 | CAS 30 | 含上年末对比列 |
| 利润表 | CAS 30 | 当期 + 年初至今，含营业利润、利润总额等中国特有指标 |
| 现金流量表 | CAS 31 | 直接法 + 间接法两种编制方式 |
| 所有者权益变动表 | CAS 30 | 强制编制，矩阵式结构 |
| 合并财务报表 | CAS 33 | 含非控制性权益，支持消除内部交易 |

### 应收/应付管理（AR/AP）
- 客户发票 & 供应商发票全生命周期管理
- 账龄分析报表（未到期/1-30天/31-60天/…/1年以上分区间）
- 坏账准备测算辅助工具
- 应收/应付余额与总账科目自动核对

### 固定资产
- 资产台账管理（外购/在建工程转入）
- 多种折旧方法（直线法/加速法/工作量法）
- 折旧汇总表，按部门分类，对应费用科目
- 资产减值、处置全流程支持

### 多货币 & 汇率
- 支持全部 ISO 4217 货币
- 汇率类型：期末汇率、平均汇率、历史汇率
- 支持从欧洲央行（ECB）手动同步实时汇率

### 增值税（VAT）
- 进销项发票管理
- 增值税汇总报表（按税率分组）
- 附加税自动计算（城建税/教育费附加/地方教育附加）

### 集团合并
- 集团科目表（两层科目映射：直接映射 / 区间映射）
- 内部交易消除
- 权益变动表
- 多公司货币折算差额处理（CAS 19，计入其他综合收益）

### 权限管理（RBAC）
- **基础角色**：Owner / Admin / Member / Viewer
- **职能角色**：会计总监、财务经理、会计、期间管理员、合并经理
- 可视化权限矩阵 + 引导式策略配置向导
- 内置四条不可覆盖的保护策略（已关闭期间保护、借贷平衡校验等）
- 完整审计日志

---

## 技术栈

| 层次 | 技术选型 |
|------|---------|
| 前端框架 | [Next.js 16](https://nextjs.org/) (App Router) + TypeScript |
| UI 组件 | [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)（手动安装）|
| 数据库 | PostgreSQL 17 |
| ORM | [Prisma 6](https://www.prisma.io/) |
| 身份认证 | [NextAuth.js v5](https://authjs.dev/) (beta) + `@auth/prisma-adapter` + JWT |
| 表单验证 | Zod |
| E2E 测试 | [Playwright](https://playwright.dev/) |

---

## 快速开始

### 前置条件

- Node.js 18+
- PostgreSQL 17

### 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/beenjoy/cnaccounting.git
cd cnaccounting

# 2. 安装依赖
npm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env，填写数据库连接等配置

# 4. 初始化数据库
npx prisma migrate dev

# 5. （可选）导入示例数据
npx prisma db seed

# 6. 启动开发服务器
npm run dev
```

访问 [http://localhost:3000](http://localhost:3000)，首次访问将进入引导式组织配置流程。

### 环境变量说明

```env
DATABASE_URL="postgresql://user:password@localhost:5432/cnaccouting"
AUTH_SECRET="your-auth-secret"          # NextAuth 签名密钥
NEXTAUTH_URL="http://localhost:3000"    # 生产环境替换为实际域名
```

---

## 项目结构

```
├── app/
│   ├── (auth)/              # 登录、注册、忘记密码
│   ├── (dashboard)/         # 业务功能页面（受保护路由）
│   │   ├── journals/        # 日记账凭证
│   │   ├── accounts/        # 科目表
│   │   ├── periods/         # 会计期间
│   │   ├── reports/         # 财务报表
│   │   ├── ar-invoices/     # 应收发票
│   │   ├── ap-invoices/     # 应付发票
│   │   ├── assets/          # 固定资产
│   │   ├── consolidation/   # 合并报表
│   │   └── settings/        # 组织/成员/权限设置
│   ├── api/                 # REST API 路由
│   └── onboarding/          # 组织初始化向导
├── components/
│   ├── layout/              # 侧边栏、顶部导航
│   └── ui/                  # shadcn/ui 组件
├── lib/
│   ├── auth.ts              # NextAuth 配置
│   ├── db.ts                # Prisma 单例
│   └── permissions.ts       # RBAC 权限逻辑
├── prisma/
│   ├── schema.prisma        # 数据模型定义
│   ├── migrations/          # 数据库迁移历史
│   └── seed.ts              # 示例数据
├── e2e/                     # Playwright E2E 测试
└── docs/                    # 业务设计文档（13份）
```

---

## 数据模型概览

```
Organization
  └── Company
        ├── FiscalYear
        │     └── FiscalPeriod
        ├── ChartOfAccount（科目表，支持多级层级）
        ├── JournalEntry（凭证）
        │     └── JournalEntryLine（凭证行）
        ├── ARInvoice / APInvoice
        └── FixedAsset

User
  └── OrganizationMember（角色：OWNER/ADMIN/ACCOUNTANT/AUDITOR/PERIOD_MANAGER）

Currency + ExchangeRate
AuditLog（审计日志）
GroupAccount + GroupAccountMapping（集团科目表）
```

---

## 支持的会计准则

| 准则 | 名称 | 应用场景 |
|------|------|---------|
| CAS 30 | 财务报表列报 | 资产负债表、利润表、所有者权益变动表格式 |
| CAS 31 | 现金流量表 | 直接法与间接法现金流分类 |
| CAS 33 | 合并财务报表 | 母子公司合并、非控制性权益 |
| CAS 19 | 外币折算 | 记账本位币、汇率折算、汇兑差额 |
| CAS 14 | 收入 | 收入确认 |
| CAS 6  | 无形资产 | 研发支出资本化判断 |

---

## 用户角色

| 角色 | 类型 | 主要权限 |
|------|------|---------|
| Owner（所有者）| 基础 | 完全控制，不可被移除 |
| Admin（管理员）| 基础 | 绝大多数管理权限 |
| Member（成员）| 基础 | 标准业务操作 |
| Viewer（查看者）| 基础 | 只读 |
| 会计总监（Controller）| 职能 | 审批过账、关闭期间、年末结账 |
| 财务经理（Finance Manager）| 职能 | 管理科目表与汇率，审批过账 |
| 会计（Accountant）| 职能 | 创建和提交凭证 |
| 期间管理员（Period Admin）| 职能 | 开放/关闭会计期间 |
| 合并经理（Consolidation Manager）| 职能 | 执行合并报表编制 |

---

## E2E 测试

```bash
# 安装 Playwright 浏览器（首次运行）
npx playwright install

# 运行所有 E2E 测试
npx playwright test

# 带 UI 的交互式模式
npx playwright test --ui
```

测试套件覆盖：身份认证、凭证录入、应收流程、固定资产、会计期间管理。

---

## 设计文档

`docs/` 目录包含完整的业务设计规范：

| 文件 | 内容 |
|------|------|
| `01-overview.md` | 系统概述与功能模块 |
| `02-glossary.md` | 业务术语表 |
| `03-entities.md` | 数据实体说明 |
| `04-business-rules.md` | 核心业务规则 |
| `05-workflows.md` | 业务流程说明 |
| `06-reports.md` | 财务报表规格 |
| `07-access-control.md` | 权限控制体系 |
| `08-future-features.md` | 功能规划与开发进度 |
| `09-vat-management.md` | 增值税管理 |
| `10-ar-ap-management.md` | 应收应付管理 |
| `11-fixed-assets.md` | 固定资产管理 |
| `12-journal-templates.md` | 凭证模板 |
| `13-ui-design-spec.md` | UI 设计规范 |

---

## License

MIT
