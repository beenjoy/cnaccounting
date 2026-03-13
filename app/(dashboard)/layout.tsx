import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  // 获取用户的组织信息
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: true },
    orderBy: { joinedAt: "asc" },
  });

  if (!membership) {
    redirect("/onboarding");
  }

  // 获取该组织的第一个公司
  const company = await db.company.findFirst({
    where: {
      organizationId: membership.organizationId,
      isActive: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        user={{ name: session.user.name, email: session.user.email }}
        organizationName={membership.organization.name}
        companyName={company?.name}
      />
      <Sidebar />
      <main className="ml-60 pt-14 min-h-screen print:ml-0 print:pt-0">
        <div className="p-6 print:p-0">{children}</div>
      </main>
    </div>
  );
}
