import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ProfileForm } from "./profile-form";
import { PasswordForm } from "./password-form";

export default async function AccountSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">账户设置</h1>
        <p className="text-muted-foreground mt-1">管理您的个人资料和登录密码</p>
      </div>

      {/* 个人资料 */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold border-b pb-3">个人资料</h2>
        <ProfileForm
          currentName={session.user.name ?? ""}
          email={session.user.email ?? ""}
        />
      </div>

      {/* 修改密码 */}
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <h2 className="text-base font-semibold border-b pb-3">修改密码</h2>
        <PasswordForm />
      </div>
    </div>
  );
}
