# 待实现功能

本文档记录系统已规划但尚未实现的业务功能，按优先级排列，供产品规划参考。

---

## 优先级说明

| 优先级 | 含义 |
|--------|------|
| P0 | 紧急修复，影响现有功能正确性 |
| P1 | 高优先级，影响日常操作体验 |
| P2 | 中优先级，重要的功能增强 |
| P3 | 低优先级，复杂度高，长期规划 |

---

## ~~P0 — 系统内置策略更新~~（已核查，无需修改）

**结论：** 代码库中从未引入 LOCKED / FUTURE / SOFT_CLOSE 等废弃状态值。`PeriodStatus` 枚举始终只有 `OPEN` 和 `CLOSED`，四条核心保护策略均已以硬编码方式在 API 层实现：

| 策略 | 实现位置 | 状态 |
|------|----------|------|
| 已关闭期间保护 | `app/api/journals/route.ts:47`、`journals/[id]/route.ts:78` | ✅ 已实现 |
| 有效科目要求（末级） | `app/api/journals/route.ts:83` | ✅ 已实现 |
| 借贷平衡验证 | `app/api/journals/route.ts:69` | ✅ 已实现 |
| 所有者不可移除 | 暂无成员管理 API | — 当前无入口可触发 |

---

## ~~P1 — 凭证期间选择优化~~（已完成）

**实现情况：** `app/(dashboard)/journals/journal-entry-form.tsx` 中已完整实现：

- `handleDateChange()` — 输入凭证日期后自动匹配对应会计期间（年+月精确匹配）
- 期间旁显示状态标识（开放绿色 / 已关闭橙色警告）
- 已关闭期间在下拉选项中标注"已关闭"
- 期间对应财年/月份自动识别，减少人工选错

---

## ~~P2 — 汇率自动同步~~（已完成，手动触发）

**实现情况：**

- `app/api/exchange-rates/sync/route.ts` — `POST /api/exchange-rates/sync`，从 Frankfurter API（ECB 数据）获取每日汇率
- 三角计算：`1 XXX = ECB_CNY / ECB_XXX`（6位精度）；EUR 直接使用
- 货币页汇率 Tab 增加"同步 ECB 汇率"按钮 + 最后同步时间显示
- ECB 来源显示蓝色 `ECB` 徽章，手工录入显示 `手工` 徽章
- 非 ECB 覆盖货币自动跳过，提供 `skipped` 列表

**注：** 当前为手动触发（无定时调度），已满足"支持手动触发同步"需求。如需每日自动同步，需额外配置服务端 Cron 任务（超出当前系统范围）。

---

## ~~P2 — 权限策略管理体验改进~~（已完成，引导式向导）

**实现情况：**

`app/(dashboard)/settings/permissions/policy-wizard.tsx` — 四步引导式配置向导：

| 步骤 | 内容 |
|------|------|
| Step 1（谁） | 角色卡片选择（ADMIN / 会计 / 审计 / 期间管理员）|
| Step 2（做什么） | 快速预设（只读/标准/完全访问）+ 按业务模块细化勾选 |
| Step 3（对什么） | 多资源复选框（7 个资源，支持全选/清空）|
| Step 4（确认） | 摘要卡片 + 批量保存（每资源一条 RolePolicy）|

- 向导保存后自动刷新权限矩阵，即时生效
- 在 `permission-matrix.tsx` 顶部角色 Tabs 旁增加"快速配置向导"入口

**注：** 本期未添加 `effect`（ALLOW/DENY）字段和用户级策略（无 Schema 变更），当前系统隐式全 ALLOW。

---

## ~~P3 — 集团科目表~~（已完成）

**实现情况：** 两层科目体系全量实现：

**Schema 变更（`prisma/schema.prisma`）：**
- 新增 `MappingType` 枚举（`DIRECT` / `RANGE`）
- 新增 `GroupAccount` 模型（组织级，支持层级树，`@@unique([organizationId, code])`）
- 新增 `GroupAccountMapping` 模型（公司级映射，含 DIRECT / RANGE 两种方式）

**API 路由（4个）：**
- `GET/POST /api/group-accounts` — 查询/创建集团科目
- `PUT/DELETE /api/group-accounts/[id]` — 更新/删除集团科目（含子科目保护）
- `GET/POST /api/group-account-mappings` — 查询/创建公司映射
- `DELETE /api/group-account-mappings/[id]` — 删除映射

**UI 页面：**
- `app/(dashboard)/settings/group-accounts/` — 集团科目管理页（左侧层级树 + 右侧详情/映射）
  - 层级树：折叠展开，映射计数徽章，点击选中
  - 详情面板：科目信息 + 公司映射列表 + 添加映射 Dialog（支持 DIRECT/RANGE）
- `app/(dashboard)/consolidation/[id]/group-mapping/` — 集团科目对照视图
  - 矩阵表格：集团科目（行）× 成员公司（列）× 余额
  - 本地科目代码提示行，期末余额合计，支持年月筛选

**侧边栏导航：**
- 重构为 8 个可折叠分组（CSS `grid-rows` 动画），"集团科目表"入口位于"系统设置"分组

---

## 功能优先级汇总

| 功能 | 优先级 | 状态 | 预估复杂度 |
|------|--------|------|-----------|
| ~~系统策略更新~~ | ~~P0~~ | ✅ 已核查，代码正确 | — |
| ~~凭证期间选择优化~~ | ~~P1~~ | ✅ 已完成 | 中 |
| ~~汇率自动同步~~ | ~~P2~~ | ✅ 已完成（手动触发） | 高 |
| ~~权限策略 UX 改进~~ | ~~P2~~ | ✅ 已完成（引导向导） | 高 |
| ~~集团科目表~~ | ~~P3~~ | ✅ 已完成 | 非常高 |

---

*本文档将随产品规划更新持续修订。功能完成后将移至已完成功能文档存档。*
