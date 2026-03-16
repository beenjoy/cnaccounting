import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InviteCodeCard } from "./invite-code-card";
import { MemberRoleSelector } from "./member-role-selector";
import { ResetPasswordButton } from "./reset-password-button";

export default async function OrganizationSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: {
      organization: {
        include: {
          members: { include: { user: { select: { name: true, email: true } } } },
        },
      },
    },
  });

  if (!membership) redirect("/onboarding");

  const org = membership.organization;
  const canSeeInviteCode = membership.role === "OWNER" || membership.role === "ADMIN";
  const canManageRoles = membership.role === "OWNER";
  const canResetPassword = membership.role === "OWNER" || membership.role === "ADMIN";

  const roleLabel: Record<string, string> = {
    OWNER: "所有者",
    ADMIN: "管理员",
    ACCOUNTANT: "会计",
    AUDITOR: "审计员",
    PERIOD_MANAGER: "期间管理员",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">组织设置</h1>
        <p className="text-muted-foreground mt-1">管理组织信息和成员</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">组织信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">组织名称</span>
            <span className="font-medium">{org.name}</span>
          </div>
          <div className="flex justify-between py-2 border-b">
            <span className="text-muted-foreground">组织标识</span>
            <span className="font-mono">{org.slug}</span>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-muted-foreground">成员数量</span>
            <span>{org.members.length}</span>
          </div>
        </CardContent>
      </Card>

      {canSeeInviteCode && <InviteCodeCard inviteCode={org.inviteCode} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">成员列表</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {org.members.map((m) => {
              const isSelf = m.userId === session.user!.id;
              const isOwner = m.role === "OWNER";
              const showSelector = canManageRoles && !isSelf && !isOwner;
              const showReset = canResetPassword && !isSelf;
              return (
                <div key={m.id} className="flex items-center justify-between py-2 border-b last:border-0">
                  <div>
                    <p className="text-sm font-medium">
                      {m.user.name || m.user.email}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">（我）</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{m.user.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    {showReset && (
                      <ResetPasswordButton
                        memberId={m.id}
                        userName={m.user.name || m.user.email || ""}
                      />
                    )}
                    {showSelector ? (
                      <MemberRoleSelector memberId={m.id} currentRole={m.role} />
                    ) : (
                      <Badge variant={isOwner ? "default" : "secondary"}>
                        {roleLabel[m.role]}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
