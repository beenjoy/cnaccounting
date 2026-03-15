-- CreateEnum
CREATE TYPE "MappingType" AS ENUM ('DIRECT', 'RANGE');

-- CreateTable
CREATE TABLE "group_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "accountType" "AccountType" NOT NULL,
    "normalBalance" "AccountNormalBalance" NOT NULL,
    "parentId" TEXT,
    "level" INTEGER NOT NULL DEFAULT 1,
    "isLeaf" BOOLEAN NOT NULL DEFAULT true,
    "reportCategory" "ReportCategory",
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_account_mappings" (
    "id" TEXT NOT NULL,
    "groupAccountId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "mappingType" "MappingType" NOT NULL DEFAULT 'DIRECT',
    "localCode" TEXT,
    "rangeStart" TEXT,
    "rangeEnd" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_account_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_accounts_organizationId_idx" ON "group_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "group_accounts_organizationId_code_key" ON "group_accounts"("organizationId", "code");

-- CreateIndex
CREATE INDEX "group_account_mappings_groupAccountId_idx" ON "group_account_mappings"("groupAccountId");

-- CreateIndex
CREATE INDEX "group_account_mappings_companyId_idx" ON "group_account_mappings"("companyId");

-- AddForeignKey
ALTER TABLE "group_accounts" ADD CONSTRAINT "group_accounts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_accounts" ADD CONSTRAINT "group_accounts_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "group_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_account_mappings" ADD CONSTRAINT "group_account_mappings_groupAccountId_fkey" FOREIGN KEY ("groupAccountId") REFERENCES "group_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_account_mappings" ADD CONSTRAINT "group_account_mappings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
