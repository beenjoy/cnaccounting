import { RegisterForm } from "./register-form";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-lg border shadow-sm p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">注册账号</h1>
          <p className="text-sm text-muted-foreground mt-1">
            创建账号并设置您的组织
          </p>
        </div>
        <RegisterForm />
        <div className="mt-4 text-center text-sm text-muted-foreground">
          已有账号？{" "}
          <Link href="/login" className="text-blue-600 hover:underline">
            立即登录
          </Link>
        </div>
      </div>
    </div>
  );
}
