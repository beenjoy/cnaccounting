"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
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
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  FileBadge,
  ClipboardCheck,
  Wrench,
  Package,
  GitMerge,
  LayoutTemplate,
  Settings2,
  ChevronRight,
  Network,
} from "lucide-react";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface SectionDef {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

// ── Section definitions ────────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  {
    id: "daily",
    label: "日常记账",
    icon: BookOpen,
    items: [
      { href: "/accounts", label: "科目表", icon: BookOpen },
      { href: "/journals", label: "日记账凭证", icon: FileText },
      { href: "/journals/templates", label: "凭证模板", icon: LayoutTemplate },
      { href: "/periods", label: "会计期间", icon: Calendar },
      { href: "/periods/year-end", label: "年末结账", icon: Calendar },
      { href: "/currencies", label: "货币与汇率", icon: DollarSign },
      { href: "/ledger", label: "明细账", icon: ClipboardList },
    ],
  },
  {
    id: "reports",
    label: "财务报表",
    icon: BarChart3,
    items: [
      { href: "/reports/trial-balance", label: "试算表", icon: TrendingUp },
      { href: "/reports/balance-sheet", label: "资产负债表", icon: Scale },
      { href: "/reports/income-statement", label: "利润表", icon: Receipt },
      { href: "/reports/cash-flow", label: "现金流量表", icon: Waves },
      { href: "/reports/equity-changes", label: "权益变动表", icon: TrendingUp },
      { href: "/reports/ar-aging", label: "应收账龄", icon: BarChart3 },
      { href: "/reports/ap-aging", label: "应付账龄", icon: BarChart3 },
    ],
  },
  {
    id: "ar",
    label: "应收管理",
    icon: ArrowDownToLine,
    items: [
      { href: "/ar/customers", label: "客户档案", icon: Users },
      { href: "/ar/invoices", label: "应收发票", icon: ArrowDownToLine },
    ],
  },
  {
    id: "ap",
    label: "应付管理",
    icon: ArrowUpFromLine,
    items: [
      { href: "/ap/vendors", label: "供应商档案", icon: Building2 },
      { href: "/ap/invoices", label: "应付发票", icon: ArrowUpFromLine },
    ],
  },
  {
    id: "assets",
    label: "固定资产",
    icon: Package,
    items: [
      { href: "/assets", label: "资产台账", icon: Package },
      { href: "/assets/depreciation", label: "月度折旧", icon: Wrench },
      { href: "/reports/asset-schedule", label: "折旧明细表", icon: BarChart3 },
    ],
  },
  {
    id: "vat",
    label: "增值税",
    icon: FileBadge,
    items: [
      { href: "/vat/records", label: "进销项台账", icon: FileBadge },
      { href: "/vat/declaration", label: "增值税申报", icon: ClipboardCheck },
      { href: "/reports/vat-summary", label: "增值税汇总表", icon: BarChart3 },
    ],
  },
  {
    id: "consolidation",
    label: "合并报表",
    icon: GitMerge,
    items: [
      { href: "/consolidation", label: "合并组管理", icon: GitMerge },
    ],
  },
  {
    id: "settings",
    label: "系统设置",
    icon: Settings2,
    items: [
      { href: "/settings/group-accounts", label: "集团科目表", icon: Network },
      { href: "/settings/organization", label: "组织设置", icon: Building2 },
      { href: "/settings/companies", label: "公司管理", icon: Building2 },
      { href: "/settings/permissions", label: "权限管理", icon: ShieldCheck },
      { href: "/settings/audit-log", label: "审计日志", icon: Users },
    ],
  },
];

// ── Helper: determine which section a path belongs to ─────────────────────────

function getSectionForPath(pathname: string): string | null {
  for (const section of SECTIONS) {
    for (const item of section.items) {
      if (pathname === item.href || pathname.startsWith(item.href + "/")) {
        return section.id;
      }
    }
  }
  return null;
}

// ── NavLink component ──────────────────────────────────────────────────────────

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const isActive =
    pathname === item.href || pathname.startsWith(item.href + "/");
  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2.5 pl-8 pr-3 py-1.5 rounded-md text-sm transition-colors",
        isActive
          ? "bg-slate-700 text-white font-medium"
          : "text-slate-400 hover:bg-slate-800 hover:text-slate-100"
      )}
    >
      <item.icon className="h-3.5 w-3.5 shrink-0" />
      {item.label}
    </Link>
  );
}

// ── CollapsibleSection component ───────────────────────────────────────────────

function CollapsibleSection({
  section,
  isOpen,
  onToggle,
  pathname,
}: {
  section: SectionDef;
  isOpen: boolean;
  onToggle: () => void;
  pathname: string;
}) {
  const hasActiveChild = section.items.some(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/")
  );

  return (
    <div>
      {/* Section header button */}
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-left",
          hasActiveChild
            ? "text-slate-100 bg-slate-800/80"
            : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
        )}
      >
        <section.icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{section.label}</span>
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 transition-transform duration-200",
            isOpen && "rotate-90"
          )}
        />
      </button>

      {/* Collapsible content using grid-rows trick */}
      <div
        className={cn(
          "grid transition-all duration-200 ease-in-out",
          isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        )}
      >
        <div className="overflow-hidden">
          <div className="mt-0.5 space-y-0.5 pb-1">
            {section.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sidebar ────────────────────────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();

  // Initialize: open the section containing the current route
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const activeSection = getSectionForPath(pathname);
    return activeSection ? new Set([activeSection]) : new Set(["daily"]);
  });

  // When route changes (e.g. user navigates), auto-expand the new active section
  useEffect(() => {
    const activeSection = getSectionForPath(pathname);
    if (activeSection) {
      setOpenSections((prev) => {
        if (prev.has(activeSection)) return prev;
        return new Set([...prev, activeSection]);
      });
    }
  }, [pathname]);

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const isDashboardActive = pathname === "/dashboard";

  return (
    <aside className="no-print fixed left-0 top-14 z-30 h-[calc(100vh-3.5rem)] w-60 border-r bg-slate-900 text-slate-100 overflow-y-auto">
      <div className="flex flex-col h-full py-3">
        <nav className="flex-1 px-3 space-y-0.5">
          {/* Dashboard — always visible, no fold */}
          <Link
            href="/dashboard"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
              isDashboardActive
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            )}
          >
            <LayoutDashboard className="h-4 w-4 shrink-0" />
            仪表盘
          </Link>

          {/* Collapsible sections */}
          {SECTIONS.map((section) => (
            <CollapsibleSection
              key={section.id}
              section={section}
              isOpen={openSections.has(section.id)}
              onToggle={() => toggleSection(section.id)}
              pathname={pathname}
            />
          ))}
        </nav>

        {/* Bottom version indicator */}
        <div className="px-4 pt-3 border-t border-slate-800">
          <p className="text-xs text-slate-600">财务系统 v1.0</p>
        </div>
      </div>
    </aside>
  );
}
