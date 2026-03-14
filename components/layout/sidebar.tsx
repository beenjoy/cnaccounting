"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  BookOpen,
  Building2,
  Calendar,
  ClipboardList,
  DollarSign,
  FileText,
  LayoutDashboard,
  Receipt,
  Scale,
  ShieldCheck,
  TrendingUp,
  Users,
  Waves,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "仪表盘", icon: LayoutDashboard },
  {
    href: "/accounts",
    label: "科目表",
    icon: BookOpen,
  },
  {
    href: "/journals",
    label: "日记账凭证",
    icon: FileText,
  },
  {
    href: "/periods",
    label: "会计期间",
    icon: Calendar,
  },
  {
    href: "/periods/year-end",
    label: "年末结账",
    icon: Calendar,
  },
  {
    href: "/currencies",
    label: "货币与汇率",
    icon: DollarSign,
  },
  {
    href: "/ledger",
    label: "明细账",
    icon: ClipboardList,
  },
  {
    href: "/reports/trial-balance",
    label: "试算表",
    icon: TrendingUp,
  },
  {
    href: "/reports/balance-sheet",
    label: "资产负债表",
    icon: Scale,
  },
  {
    href: "/reports/income-statement",
    label: "利润表",
    icon: Receipt,
  },
  {
    href: "/reports/cash-flow",
    label: "现金流量表",
    icon: Waves,
  },
  {
    href: "/reports/equity-changes",
    label: "权益变动表",
    icon: TrendingUp,
  },
];

const settingsItems: NavItem[] = [
  { href: "/settings/organization", label: "组织设置", icon: Building2 },
  { href: "/settings/companies", label: "公司管理", icon: Building2 },
  { href: "/settings/audit-log", label: "审计日志", icon: ShieldCheck },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="no-print fixed left-0 top-14 z-30 h-[calc(100vh-3.5rem)] w-60 border-r bg-slate-900 text-slate-100 overflow-y-auto">
      <div className="flex flex-col h-full py-4">
        {/* 主导航 */}
        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* 分隔线 */}
        <div className="mx-3 my-2 h-px bg-slate-700" />

        {/* 设置 */}
        <div className="px-3 space-y-1">
          <p className="px-3 py-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            系统设置
          </p>
          {settingsItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive
                    ? "bg-slate-700 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
