-- CreateEnum
CREATE TYPE "PolicyResource" AS ENUM ('JOURNAL_ENTRY', 'CHART_OF_ACCOUNT', 'FISCAL_PERIOD', 'REPORT', 'COMPANY', 'MEMBER', 'CURRENCY');

-- CreateEnum
CREATE TYPE "PolicyAction" AS ENUM ('READ', 'CREATE', 'UPDATE', 'DELETE', 'SUBMIT', 'APPROVE', 'CLOSE_PERIOD', 'YEAR_END_CLOSE');

-- CreateTable
CREATE TABLE "role_policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "resource" "PolicyResource" NOT NULL,
    "actions" "PolicyAction"[],
    "companyScope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "role_policies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "role_policies_organizationId_role_idx" ON "role_policies"("organizationId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "role_policies_organizationId_role_resource_companyScope_key" ON "role_policies"("organizationId", "role", "resource", "companyScope");

-- AddForeignKey
ALTER TABLE "role_policies" ADD CONSTRAINT "role_policies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
