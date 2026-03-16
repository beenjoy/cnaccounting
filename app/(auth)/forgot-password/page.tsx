import Link from "next/link";
import { ShieldAlert, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <div className="w-full max-w-md">
      <div className="bg-white rounded-lg border shadow-sm p-8">
        <div className="mb-6 text-center">
          <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-orange-100 mb-4">
            <ShieldAlert className="h-6 w-6 text-orange-600" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900">忘记密码</h1>
          <p className="text-sm text-muted-foreground mt-2">
            本系统暂不支持通过邮件自动重置密码
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800 space-y-2">
          <p className="font-medium">请按以下步骤操作：</p>
          <ol className="list-decimal list-inside space-y-1.5 text-blue-700">
            <li>联系您组织的管理员（OWNER 或 ADMIN 角色）</li>
            <li>告知管理员您的登录邮箱：<strong>admin@example.com</strong></li>
            <li>
              管理员在「系统管理 → 组织设置 → 成员列表」中，
              点击您账户旁的「重置密码」按钮
            </li>
            <li>管理员会获得一个临时密码，请及时告知您</li>
            <li>使用临时密码登录后，立即前往「账户设置」修改密码</li>
          </ol>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回登录
          </Link>
        </div>
      </div>
    </div>
  );
}
