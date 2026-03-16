import { LoginForm } from "./login-form";
import Link from "next/link";

export default function LoginPage() {
  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-lg border shadow-sm p-8">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-gray-900">登录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            使用您的账号登录系统
          </p>
        </div>
        <LoginForm />
        <div className="mt-3 text-right">
          <Link href="/forgot-password" className="text-sm text-muted-foreground hover:text-blue-600">
            忘记密码？
          </Link>
        </div>
        <div className="mt-3 text-center text-sm text-muted-foreground">
          还没有账号？{" "}
          <Link href="/register" className="text-blue-600 hover:underline">
            立即注册
          </Link>
        </div>
      </div>
    </div>
  );
}
