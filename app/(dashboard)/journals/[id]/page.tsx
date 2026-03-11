import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft } from "lucide-react";
import { formatDate, formatAmount } from "@/lib/utils";
import { JournalActions } from "./journal-actions";

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

export default async function JournalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;

  const entry = await db.journalEntry.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true } },
      fiscalPeriod: { select: { name: true } },
      lines: {
        include: { account: { select: { code: true, name: true } } },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!entry) notFound();

  // 验证用户有权访问
  const membership = await db.organizationMember.findFirst({
    where: { userId: session.user.id },
    include: { organization: { include: { companies: true } } },
  });

  const companyIds = membership?.organization.companies.map((c) => c.id) ?? [];
  if (!companyIds.includes(entry.companyId)) {
    redirect("/journals");
  }

  const userMemberRole = membership?.role;

  return (
    <div className="space-y-6">
      {/* 面包屑 + 操作 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/journals">
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回列表
            </Link>
          </Button>
          <span className="text-muted-foreground">/</span>
          <span className="font-mono font-semibold">{entry.entryNumber}</span>
          <Badge variant={statusVariant[entry.status] || "secondary"}>
            {statusLabel[entry.status]}
          </Badge>
        </div>
        <JournalActions
          entryId={entry.id}
          status={entry.status}
          userRole={userMemberRole || "ACCOUNTANT"}
          createdById={entry.createdById}
          currentUserId={session.user.id}
        />
      </div>

      {/* 凭证基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">凭证信息</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground mb-1">凭证编号</p>
              <p className="font-mono font-medium">{entry.entryNumber}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">凭证日期</p>
              <p>{formatDate(entry.entryDate)}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">会计期间</p>
              <p>{entry.fiscalPeriod.name}</p>
            </div>
            <div>
              <p className="text-muted-foreground mb-1">货币</p>
              <p>{entry.currency}</p>
            </div>
            <div className="md:col-span-2">
              <p className="text-muted-foreground mb-1">摘要</p>
              <p>{entry.description}</p>
            </div>
            {entry.reference && (
              <div>
                <p className="text-muted-foreground mb-1">参考号</p>
                <p>{entry.reference}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground mb-1">制单人</p>
              <p>{entry.createdBy.name || entry.createdBy.email}</p>
            </div>
            {entry.approvedBy && (
              <div>
                <p className="text-muted-foreground mb-1">审批人</p>
                <p>{entry.approvedBy.name}</p>
              </div>
            )}
            {entry.postedAt && (
              <div>
                <p className="text-muted-foreground mb-1">过账时间</p>
                <p>{formatDate(entry.postedAt)}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 凭证明细 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">凭证明细</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-6">#</TableHead>
                <TableHead>会计科目</TableHead>
                <TableHead>摘要</TableHead>
                <TableHead className="text-right w-40">借方金额</TableHead>
                <TableHead className="text-right w-40">贷方金额</TableHead>
                <TableHead className="w-20">货币</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.lines.map((line) => (
                <TableRow key={line.id}>
                  <TableCell className="pl-6 text-muted-foreground text-xs">
                    {line.lineNumber}
                  </TableCell>
                  <TableCell>
                    <span className="font-mono text-xs text-muted-foreground mr-2">
                      {line.account.code}
                    </span>
                    {line.account.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {line.description || "-"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.debitAmount.toString() !== "0.0000"
                      ? formatAmount(line.debitAmount)
                      : ""}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {line.creditAmount.toString() !== "0.0000"
                      ? formatAmount(line.creditAmount)
                      : ""}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {line.currency}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <tfoot className="border-t">
              <tr className="bg-gray-50">
                <td colSpan={3} className="pl-6 pr-4 py-3 text-sm font-semibold text-right">
                  合计
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  {formatAmount(entry.totalDebit)}
                </td>
                <td className="px-4 py-3 text-right font-mono font-semibold">
                  {formatAmount(entry.totalCredit)}
                </td>
                <td className="px-4 py-3">
                  {entry.isBalanced ? (
                    <span className="text-green-600 text-xs">✓ 平衡</span>
                  ) : (
                    <span className="text-red-500 text-xs">✗ 不平衡</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
