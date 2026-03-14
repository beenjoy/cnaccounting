-- CreateEnum
CREATE TYPE "ConsolidationMethod" AS ENUM ('FULL', 'EQUITY', 'COST');

-- CreateEnum
CREATE TYPE "ConsolidationMemberType" AS ENUM ('PARENT', 'SUBSIDIARY');

-- AlterTable
ALTER TABLE "journal_entry_lines" ADD COLUMN     "counterpartyCompanyId" TEXT,
ADD COLUMN     "isIntercompany" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "consolidation_groups" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "reportingCurrency" TEXT NOT NULL DEFAULT 'CNY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consolidation_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consolidation_members" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "memberType" "ConsolidationMemberType" NOT NULL DEFAULT 'SUBSIDIARY',
    "ownershipPct" DECIMAL(5,4) NOT NULL DEFAULT 1.0,
    "consolidationMethod" "ConsolidationMethod" NOT NULL DEFAULT 'FULL',
    "investmentAccountCode" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consolidation_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consolidation_groups_organizationId_idx" ON "consolidation_groups"("organizationId");

-- CreateIndex
CREATE INDEX "consolidation_members_groupId_idx" ON "consolidation_members"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "consolidation_members_groupId_companyId_key" ON "consolidation_members"("groupId", "companyId");

-- AddForeignKey
ALTER TABLE "journal_entry_lines" ADD CONSTRAINT "journal_entry_lines_counterpartyCompanyId_fkey" FOREIGN KEY ("counterpartyCompanyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_groups" ADD CONSTRAINT "consolidation_groups_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_members" ADD CONSTRAINT "consolidation_members_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "consolidation_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidation_members" ADD CONSTRAINT "consolidation_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
