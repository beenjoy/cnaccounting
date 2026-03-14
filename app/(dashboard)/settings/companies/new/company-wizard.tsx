"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ChevronRight, ChevronLeft, Building2, Receipt, BookOpen, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Step 1 schema ──────────────────────────────────────────
const step1Schema = z.object({
  name: z.string().min(2, "公司名称至少2个字符"),
  legalName: z.string().optional(),
  taxId: z.string().optional(),
  functionalCurrency: z.string().default("CNY"),
  industryType: z.enum(["GENERAL", "MANUFACTURING", "SERVICE", "TRADE", "CONSTRUCTION", "FINANCE"]),
});

// ── Step 2 schema ──────────────────────────────────────────
const step2Schema = z.object({
  vatType: z.enum(["GENERAL_TAXPAYER", "SMALL_SCALE", "EXEMPT"]),
  incomeTaxRate: z.number().min(0).max(1),
  urbanMaintenance: z.number().min(0).max(1),
  educationSurcharge: z.number().min(0).max(1),
  localEducation: z.number().min(0).max(1),
});

type Step1Data = z.infer<typeof step1Schema>;
type Step2Data = z.infer<typeof step2Schema>;

// ── Constants ──────────────────────────────────────────────
const INDUSTRY_OPTIONS = [
  { value: "GENERAL",       label: "通用", description: "适用于大多数企业" },
  { value: "MANUFACTURING", label: "制造业", description: "生产制造型企业" },
  { value: "SERVICE",       label: "服务业", description: "服务型企业" },
  { value: "TRADE",         label: "商贸零售", description: "流通零售型企业" },
  { value: "CONSTRUCTION",  label: "建筑业", description: "工程建设型企业" },
  { value: "FINANCE",       label: "金融业", description: "金融保险机构" },
];

const VAT_OPTIONS = [
  { value: "GENERAL_TAXPAYER", label: "一般纳税人", description: "进项税额可抵扣，税率13%/9%/6%" },
  { value: "SMALL_SCALE",      label: "小规模纳税人", description: "征收率3%，不可抵扣进项" },
  { value: "EXEMPT",           label: "免税企业", description: "享受增值税免税政策" },
];

const INCOME_TAX_RATES = [
  { value: 0.25, label: "25%", description: "一般企业适用税率" },
  { value: 0.15, label: "15%", description: "高新技术企业优惠税率" },
  { value: 0.20, label: "20%", description: "小型微利企业税率" },
  { value: 0.10, label: "10%", description: "小型微利特别优惠税率" },
];

const URBAN_RATES = [
  { value: 0.07, label: "7%（市区）" },
  { value: 0.05, label: "5%（县镇）" },
  { value: 0.01, label: "1%（农村）" },
];

const TEMPLATE_OPTIONS = [
  {
    value: "GENERAL",
    label: "通用企业",
    description: "适用于大多数服务型、贸易型企业",
    accounts: "22个核心科目",
    highlights: ["库存现金", "银行存款", "应收/付账款", "主营业务收入/成本", "三项期间费用"],
  },
  {
    value: "MANUFACTURING",
    label: "制造业",
    description: "含生产成本、制造费用、原材料等制造业专属科目",
    accounts: "34个科目（通用+12）",
    highlights: ["原材料", "在产品 / 产成品", "生产成本 / 制造费用", "低值易耗品", "应付票据"],
  },
  {
    value: "SERVICE",
    label: "服务业",
    description: "含合同资产/负债、研发费用等服务业专属科目",
    accounts: "28个科目（通用+6）",
    highlights: ["合同资产 / 合同负债", "预收款项", "研发费用", "营业外收入"],
  },
  {
    value: "TRADE",
    label: "商贸零售",
    description: "含应收/付票据、预付/预收款项等流通业科目",
    accounts: "29个科目（通用+8）",
    highlights: ["应收票据 / 应付票据", "预付账款 / 预收账款", "其他应收款", "其他业务成本"],
  },
];

// ── Main component ─────────────────────────────────────────
export function CompanyWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [isPending, setIsPending] = useState(false);
  const [step1Data, setStep1Data] = useState<Step1Data | null>(null);
  const [step2Data, setStep2Data] = useState<Step2Data | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<string>("GENERAL");

  const form1 = useForm<Step1Data>({
    resolver: zodResolver(step1Schema),
    defaultValues: { functionalCurrency: "CNY", industryType: "GENERAL" },
  });

  const form2 = useForm<Step2Data>({
    resolver: zodResolver(step2Schema),
    defaultValues: {
      vatType: "GENERAL_TAXPAYER",
      incomeTaxRate: 0.25,
      urbanMaintenance: 0.07,
      educationSurcharge: 0.03,
      localEducation: 0.02,
    },
  });

  const handleStep1 = (data: Step1Data) => {
    setStep1Data(data);
    setStep(2);
  };

  const handleStep2 = (data: Step2Data) => {
    setStep2Data(data);
    setStep(3);
  };

  const handleSubmit = async () => {
    if (!step1Data || !step2Data) return;
    setIsPending(true);
    try {
      const payload = {
        ...step1Data,
        vatType: step2Data.vatType,
        incomeTaxRate: step2Data.incomeTaxRate,
        surtaxConfig: {
          urbanMaintenance: step2Data.urbanMaintenance,
          educationSurcharge: step2Data.educationSurcharge,
          localEducation: step2Data.localEducation,
        },
        accountTemplate: selectedTemplate,
      };

      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      if (!res.ok) {
        toast.error(result.error || "创建失败");
        return;
      }

      toast.success("公司创建成功！");
      router.push("/settings/companies");
      router.refresh();
    } catch {
      toast.error("网络错误，请重试");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[
          { n: 1, icon: Building2, label: "基本信息" },
          { n: 2, icon: Receipt,   label: "税务配置" },
          { n: 3, icon: BookOpen,  label: "科目模板" },
        ].map(({ n, icon: Icon, label }, idx) => (
          <div key={n} className="flex items-center gap-2">
            {idx > 0 && <div className={`h-px w-8 ${step > n - 1 ? "bg-primary" : "bg-border"}`} />}
            <div className={`flex items-center gap-1.5 text-sm font-medium ${step === n ? "text-primary" : step > n ? "text-primary" : "text-muted-foreground"}`}>
              <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${step > n ? "bg-primary text-primary-foreground" : step === n ? "border-2 border-primary text-primary" : "border-2 border-muted text-muted-foreground"}`}>
                {step > n ? <Check className="h-4 w-4" /> : n}
              </div>
              <span className="hidden sm:inline">{label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* ── Step 1: 基本信息 ── */}
      {step === 1 && (
        <form onSubmit={form1.handleSubmit(handleStep1)} className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="name">公司名称 *</Label>
              <Input id="name" placeholder="例：北京科技有限公司" {...form1.register("name")} />
              {form1.formState.errors.name && <p className="text-sm text-red-500">{form1.formState.errors.name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="legalName">法定全称</Label>
              <Input id="legalName" placeholder="可选" {...form1.register("legalName")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="taxId">统一社会信用代码（税号）</Label>
              <Input id="taxId" placeholder="91110000XXXXXXXX" {...form1.register("taxId")} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="functionalCurrency">记账本位币</Label>
              <Input id="functionalCurrency" defaultValue="CNY" {...form1.register("functionalCurrency")} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>行业分类</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {INDUSTRY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => form1.setValue("industryType", opt.value as Step1Data["industryType"])}
                  className={`rounded-lg border p-3 text-left transition-colors ${form1.watch("industryType") === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                >
                  <p className="text-sm font-medium">{opt.label}</p>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button type="submit">
              下一步：税务配置 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </form>
      )}

      {/* ── Step 2: 税务配置 ── */}
      {step === 2 && (
        <form onSubmit={form2.handleSubmit(handleStep2)} className="space-y-5">
          <div className="space-y-2">
            <Label>增值税纳税人类型</Label>
            <div className="grid gap-2">
              {VAT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => form2.setValue("vatType", opt.value as Step2Data["vatType"])}
                  className={`rounded-lg border p-3 text-left transition-colors ${form2.watch("vatType") === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{opt.label}</p>
                    {form2.watch("vatType") === opt.value && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-xs text-muted-foreground">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>企业所得税税率</Label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {INCOME_TAX_RATES.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => form2.setValue("incomeTaxRate", opt.value)}
                  className={`rounded-lg border p-3 text-center transition-colors ${form2.watch("incomeTaxRate") === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
                >
                  <p className="text-lg font-bold">{opt.label}</p>
                  <p className="text-xs text-muted-foreground mt-1">{opt.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-4">
            <p className="text-sm font-medium">附加税费率（自动计算）</p>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">城市维护建设税</Label>
                <div className="flex gap-2">
                  {URBAN_RATES.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => form2.setValue("urbanMaintenance", opt.value)}
                      className={`flex-1 rounded border py-1.5 text-xs font-medium transition-colors ${form2.watch("urbanMaintenance") === opt.value ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-muted-foreground"}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center justify-between rounded border px-3 py-2">
                  <span className="text-xs text-muted-foreground">教育费附加</span>
                  <span className="text-sm font-medium">3%</span>
                </div>
                <div className="flex items-center justify-between rounded border px-3 py-2">
                  <span className="text-xs text-muted-foreground">地方教育附加</span>
                  <span className="text-sm font-medium">2%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(1)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> 上一步
            </Button>
            <Button type="submit">
              下一步：科目模板 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </form>
      )}

      {/* ── Step 3: 科目模板 ── */}
      {step === 3 && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2">
            {TEMPLATE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSelectedTemplate(opt.value)}
                className={`rounded-lg border p-4 text-left transition-colors ${selectedTemplate === opt.value ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground"}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-medium">{opt.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs shrink-0 ml-2">{opt.accounts}</Badge>
                </div>
                <div className="space-y-1 mt-3">
                  {opt.highlights.map((h) => (
                    <div key={h} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <div className="h-1 w-1 rounded-full bg-muted-foreground shrink-0" />
                      {h}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground">
            科目模板决定系统初始化时创建的会计科目。创建后仍可在「科目表」中手动添加或调整科目。
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="outline" onClick={() => setStep(2)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> 上一步
            </Button>
            <Button onClick={handleSubmit} disabled={isPending}>
              {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              创建公司
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
