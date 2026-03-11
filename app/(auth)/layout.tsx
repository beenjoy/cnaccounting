import type { Metadata } from "next";
import { Building2 } from "lucide-react";

export const metadata: Metadata = {
  title: "登录",
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 flex items-center gap-2">
        <Building2 className="h-8 w-8 text-blue-600" />
        <span className="text-2xl font-bold text-gray-900">企业财务管理系统</span>
      </div>
      {children}
    </div>
  );
}
