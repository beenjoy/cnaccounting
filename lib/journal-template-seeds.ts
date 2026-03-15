/**
 * 系统内置凭证模板定义（基于 docs/12-journal-templates.md）
 * 科目编码参照中国企业会计准则标准科目体系
 */

export type TemplateLine = {
  lineNumber: number;
  accountCode: string;
  accountName: string;
  direction: "DEBIT" | "CREDIT";
  description?: string;
};

export type TemplateDefinition = {
  name: string;
  description: string;
  category: string;
  sortOrder: number;
  lines: TemplateLine[];
};

export const BUILT_IN_TEMPLATES: TemplateDefinition[] = [
  // ── 一、采购与应付账款 ─────────────────────────
  {
    name: "赊购原材料（含进项税）",
    description: "购入原材料，取得增值税专用发票，货款暂挂应付账款",
    category: "采购",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "1401", accountName: "原材料",           direction: "DEBIT",  description: "购入原材料" },
      { lineNumber: 2, accountCode: "2221", accountName: "应交税费—进项税额", direction: "DEBIT",  description: "进项税额" },
      { lineNumber: 3, accountCode: "2202", accountName: "应付账款",          direction: "CREDIT", description: "应付货款" },
    ],
  },
  {
    name: "采购办公用品（银行付款）",
    description: "采购办公用品并用银行存款支付，进项税额可抵扣",
    category: "采购",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "6602", accountName: "管理费用—办公费",   direction: "DEBIT",  description: "办公用品" },
      { lineNumber: 2, accountCode: "2221", accountName: "应交税费—进项税额", direction: "DEBIT",  description: "进项税额" },
      { lineNumber: 3, accountCode: "1002", accountName: "银行存款",          direction: "CREDIT", description: "银行付款" },
    ],
  },
  {
    name: "支付应付账款",
    description: "通过银行转账支付供应商货款",
    category: "采购",
    sortOrder: 30,
    lines: [
      { lineNumber: 1, accountCode: "2202", accountName: "应付账款", direction: "DEBIT",  description: "结清账款" },
      { lineNumber: 2, accountCode: "1002", accountName: "银行存款", direction: "CREDIT", description: "银行付款" },
    ],
  },

  // ── 二、销售与应收账款 ─────────────────────────
  {
    name: "赊销商品（含销项税）",
    description: "销售商品，开具增值税专用发票，货款尚未收到",
    category: "销售",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "1122", accountName: "应收账款",          direction: "DEBIT",  description: "应收货款" },
      { lineNumber: 2, accountCode: "5001", accountName: "主营业务收入",       direction: "CREDIT", description: "销售收入" },
      { lineNumber: 3, accountCode: "2221", accountName: "应交税费—销项税额", direction: "CREDIT", description: "销项税额" },
    ],
  },
  {
    name: "结转销售成本",
    description: "销售商品后，将库存商品成本结转至主营业务成本",
    category: "销售",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "6001", accountName: "主营业务成本", direction: "DEBIT",  description: "结转成本" },
      { lineNumber: 2, accountCode: "1405", accountName: "库存商品",     direction: "CREDIT", description: "结转成本" },
    ],
  },
  {
    name: "收到客户货款",
    description: "收到客户银行转账，核销应收账款",
    category: "销售",
    sortOrder: 30,
    lines: [
      { lineNumber: 1, accountCode: "1002", accountName: "银行存款", direction: "DEBIT",  description: "收到货款" },
      { lineNumber: 2, accountCode: "1122", accountName: "应收账款", direction: "CREDIT", description: "核销应收" },
    ],
  },

  // ── 三、增值税处理 ─────────────────────────────
  {
    name: "月末增值税结转",
    description: "月末将应交增值税（销项-进项）结转至未交增值税",
    category: "增值税",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "2221", accountName: "应交税费—转出未交增值税", direction: "DEBIT",  description: "月末结转" },
      { lineNumber: 2, accountCode: "2221", accountName: "应交税费—未交增值税",     direction: "CREDIT", description: "月末结转" },
    ],
  },
  {
    name: "缴纳增值税",
    description: "次月申报后，从银行缴纳上月应交增值税",
    category: "增值税",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "2221", accountName: "应交税费—未交增值税", direction: "DEBIT",  description: "缴纳税款" },
      { lineNumber: 2, accountCode: "1002", accountName: "银行存款",           direction: "CREDIT", description: "银行付款" },
    ],
  },
  {
    name: "计提增值税附加税",
    description: "按实缴增值税计提城建税、教育费附加、地方教育附加",
    category: "增值税",
    sortOrder: 30,
    lines: [
      { lineNumber: 1, accountCode: "6051", accountName: "税金及附加",            direction: "DEBIT",  description: "计提附加税" },
      { lineNumber: 2, accountCode: "2221", accountName: "应交税费—城市维护建设税", direction: "CREDIT", description: "城建税7%" },
      { lineNumber: 3, accountCode: "2221", accountName: "应交税费—教育费附加",    direction: "CREDIT", description: "教育费附加3%" },
      { lineNumber: 4, accountCode: "2221", accountName: "应交税费—地方教育附加",  direction: "CREDIT", description: "地方教育附加2%" },
    ],
  },

  // ── 四、工资薪酬 ───────────────────────────────
  {
    name: "计提月度工资",
    description: "月末计提管理/销售/生产人员工资，贷记应付职工薪酬",
    category: "工资",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "6602", accountName: "管理费用—工资", direction: "DEBIT",  description: "管理人员工资" },
      { lineNumber: 2, accountCode: "6601", accountName: "销售费用—工资", direction: "DEBIT",  description: "销售人员工资" },
      { lineNumber: 3, accountCode: "2211", accountName: "应付职工薪酬",  direction: "CREDIT", description: "应付工资" },
    ],
  },
  {
    name: "实际发放工资",
    description: "发放工资，代扣个人所得税和个人社保，银行实付",
    category: "工资",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "2211", accountName: "应付职工薪酬",         direction: "DEBIT",  description: "发放工资" },
      { lineNumber: 2, accountCode: "2221", accountName: "应交税费—个人所得税",  direction: "CREDIT", description: "代扣个税" },
      { lineNumber: 3, accountCode: "2211", accountName: "应付职工薪酬—社保个人", direction: "CREDIT", description: "代扣个人社保" },
      { lineNumber: 4, accountCode: "1002", accountName: "银行存款",             direction: "CREDIT", description: "实发金额" },
    ],
  },

  // ── 五、固定资产 ───────────────────────────────
  {
    name: "购入固定资产",
    description: "购入固定资产，取得增值税专用发票，银行存款支付",
    category: "固定资产",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "1601", accountName: "固定资产",         direction: "DEBIT",  description: "固定资产原值" },
      { lineNumber: 2, accountCode: "2221", accountName: "应交税费—进项税额", direction: "DEBIT",  description: "进项税额" },
      { lineNumber: 3, accountCode: "1002", accountName: "银行存款",          direction: "CREDIT", description: "银行付款" },
    ],
  },
  {
    name: "计提月度折旧",
    description: "月末计提固定资产折旧（管理部门和生产部门）",
    category: "固定资产",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "6602", accountName: "管理费用—折旧费", direction: "DEBIT",  description: "管理设备折旧" },
      { lineNumber: 2, accountCode: "4105", accountName: "制造费用—折旧费", direction: "DEBIT",  description: "生产设备折旧" },
      { lineNumber: 3, accountCode: "1602", accountName: "累计折旧",         direction: "CREDIT", description: "本月折旧额" },
    ],
  },

  // ── 六、期末调整 ───────────────────────────────
  {
    name: "计提预提费用",
    description: "月末确认应计但尚未支付的费用（如利息、租金）",
    category: "期末调整",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "6603", accountName: "财务费用—利息费用", direction: "DEBIT",  description: "应计利息" },
      { lineNumber: 2, accountCode: "2241", accountName: "其他应付款—应计利息", direction: "CREDIT", description: "应计利息" },
    ],
  },
  {
    name: "摊销预付费用",
    description: "按月摊销预付款项（如预付租金、保险费等）",
    category: "期末调整",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "6602", accountName: "管理费用—租金", direction: "DEBIT",  description: "本月摊销" },
      { lineNumber: 2, accountCode: "1221", accountName: "预付账款",      direction: "CREDIT", description: "摊销预付款" },
    ],
  },
  {
    name: "计提坏账准备",
    description: "月末账龄分析后补提坏账准备",
    category: "期末调整",
    sortOrder: 30,
    lines: [
      { lineNumber: 1, accountCode: "6702", accountName: "信用减值损失", direction: "DEBIT",  description: "补提坏账准备" },
      { lineNumber: 2, accountCode: "1122", accountName: "坏账准备",     direction: "CREDIT", description: "坏账准备" },
    ],
  },

  // ── 七、企业所得税 ─────────────────────────────
  {
    name: "计提季度预缴所得税",
    description: "按季度预缴企业所得税",
    category: "所得税",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "6801", accountName: "所得税费用",        direction: "DEBIT",  description: "预缴所得税" },
      { lineNumber: 2, accountCode: "2221", accountName: "应交税费—应交所得税", direction: "CREDIT", description: "应交所得税" },
    ],
  },
  {
    name: "缴纳企业所得税",
    description: "实际从银行缴纳企业所得税",
    category: "所得税",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "2221", accountName: "应交税费—应交所得税", direction: "DEBIT",  description: "缴纳税款" },
      { lineNumber: 2, accountCode: "1002", accountName: "银行存款",           direction: "CREDIT", description: "银行付款" },
    ],
  },

  // ── 八、资金往来 ───────────────────────────────
  {
    name: "取得短期借款",
    description: "从银行取得短期借款，存入银行账户",
    category: "资金往来",
    sortOrder: 10,
    lines: [
      { lineNumber: 1, accountCode: "1002", accountName: "银行存款", direction: "DEBIT",  description: "收到借款" },
      { lineNumber: 2, accountCode: "2001", accountName: "短期借款", direction: "CREDIT", description: "短期借款" },
    ],
  },
  {
    name: "计提借款利息",
    description: "月末计提短期借款利息",
    category: "资金往来",
    sortOrder: 20,
    lines: [
      { lineNumber: 1, accountCode: "6603", accountName: "财务费用—利息费用",  direction: "DEBIT",  description: "利息费用" },
      { lineNumber: 2, accountCode: "2241", accountName: "其他应付款—应计利息", direction: "CREDIT", description: "应计利息" },
    ],
  },
  {
    name: "偿还借款本息",
    description: "到期偿还短期借款本金及利息",
    category: "资金往来",
    sortOrder: 30,
    lines: [
      { lineNumber: 1, accountCode: "2001", accountName: "短期借款",           direction: "DEBIT",  description: "偿还本金" },
      { lineNumber: 2, accountCode: "2241", accountName: "其他应付款—应计利息", direction: "DEBIT",  description: "偿还利息" },
      { lineNumber: 3, accountCode: "1002", accountName: "银行存款",           direction: "CREDIT", description: "银行付款" },
    ],
  },
];
