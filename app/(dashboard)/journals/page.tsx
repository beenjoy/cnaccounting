import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus } from "lucide-react";
import { formatDate, formatAmount } from "@/lib/utils";

const statusLabel: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_APPROVAL: "待审批",
  APPROVED: "已审批",
  POSTED: "已过账",
  REVERSED: "已冲销",
};

const statusVariant: Record<string, "default" | "secondary" | "info" | "success" | "warning" | "destructive"> = {
  DRAFT: "secondary",
  PENDING_APPROVAL: "warning",
  APPROVED: "info",
  POSTED: "success",
  REVERSED: "destructive",
};

export default async function JournalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: { where: { isActive: true }, take: 1 } } } },
  });

  const company = membership?.organization.companies[0];
  if (!company) redirect("/settings/companies");

  const journals = await db.journalEntry.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      createdBy: { select: { name: true } },
      fiscalPeriod: { select: { name: true } },
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">日记账凭证</h1>
          <p className="text-muted-foreground mt-1">管理所有会计凭证</p>
        </div>
        <Button asChild size="sm">
          <Link href="/journals/new">
            <Plus className="mr-1 h-4 w-4" />
            新建凭证
          </Link>
        </Button>
      </div>

      <div className="rounded-md border bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-40">凭证编号</TableHead>
              <TableHead className="w-28">凭证日期</TableHead>
              <TableHead>摘要</TableHead>
              <TableHead className="w-28">会计期间</TableHead>
              <TableHead className="w-32 text-right">借方合计</TableHead>
              <TableHead className="w-24">状态</TableHead>
              <TableHead className="w-24">制单人</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                  暂无凭证，
                  <Link href="/journals/new" className="text-blue-600 hover:underline">
                    立即创建
                  </Link>
                </TableCell>
              </TableRow>
            ) : (
              journals.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    <Link
                      href={`/journals/${entry.id}`}
                      className="font-mono text-sm font-medium text-blue-600 hover:underline"
                    >
                      {entry.entryNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm">{formatDate(entry.entryDate)}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{entry.description}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.fiscalPeriod.name}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatAmount(entry.totalDebit)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[entry.status] || "secondary"}>
                      {statusLabel[entry.status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {entry.createdBy.name}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
