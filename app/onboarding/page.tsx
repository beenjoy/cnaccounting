import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { Building2 } from "lucide-react";

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // 检查是否已有组织
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
  });

  if (membership) redirect("/dashboard");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-lg border shadow-sm p-8 text-center">
        <Building2 className="h-12 w-12 text-blue-600 mx-auto mb-4" />
        <h1 className="text-xl font-semibold mb-2">您还没有加入任何组织</h1>
        <p className="text-muted-foreground text-sm mb-6">
          请联系管理员邀请您加入组织，或者注册新账号时创建组织。
        </p>
        <div className="flex gap-3 justify-center">
          <Link
            href="/register"
            className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90"
          >
            创建新组织
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            重新登录
          </Link>
        </div>
      </div>
    </div>
  );
}
