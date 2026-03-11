"use client";

import { signOut } from "next-auth/react";
import { Building2, ChevronDown, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface HeaderProps {
  user: {
    name?: string | null;
    email?: string | null;
  };
  organizationName: string;
  companyName?: string;
}

export function Header({ user, organizationName, companyName }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-14 border-b bg-white flex items-center px-4 gap-4">
      {/* Logo + 组织名称 */}
      <div className="flex items-center gap-2 min-w-[240px]">
        <Building2 className="h-6 w-6 text-blue-600" />
        <span className="font-semibold text-slate-900 text-sm">{organizationName}</span>
      </div>

      {/* 当前公司 */}
      {companyName && (
        <div className="flex items-center gap-1 text-sm text-slate-500">
          <span>/</span>
          <span className="font-medium text-slate-700">{companyName}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* 用户菜单 */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-blue-100 flex items-center justify-center">
              <User className="h-4 w-4 text-blue-600" />
            </div>
            <span className="text-sm">{user.name || user.email}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-muted-foreground">{user.email}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            账户设置
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-red-600"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="mr-2 h-4 w-4" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
