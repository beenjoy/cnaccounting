-- CreateEnum
CREATE TYPE "AssetCategory" AS ENUM ('BUILDINGS', 'MACHINERY', 'VEHICLES', 'ELECTRONICS', 'OFFICE_FURNITURE', 'OTHER');

-- CreateEnum
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE', 'SUM_OF_YEARS', 'USAGE_BASED');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('ACTIVE', 'IDLE', 'DISPOSED', 'FULLY_DEPRECIATED');

-- CreateTable
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "assetNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "AssetCategory" NOT NULL DEFAULT 'ELECTRONICS',
    "department" TEXT,
    "location" TEXT,
    "serialNumber" TEXT,
    "acquisitionDate" DATE NOT NULL,
    "acquisitionCost" DECIMAL(20,2) NOT NULL,
    "residualRate" DECIMAL(5,4) NOT NULL DEFAULT 0.05,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "totalWorkload" DECIMAL(20,2),
    "accumulatedDepreciation" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "impairmentReserve" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "AssetStatus" NOT NULL DEFAULT 'ACTIVE',
    "costAccountId" TEXT,
    "accDepAccountId" TEXT,
    "depExpAccountId" TEXT,
    "disposalDate" DATE,
    "disposalAmount" DECIMAL(20,2),
    "disposalNotes" TEXT,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depreciation_records" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "workload" DECIMAL(20,2),
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depreciation_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "fixed_assets_companyId_status_idx" ON "fixed_assets"("companyId", "status");

-- CreateIndex
CREATE INDEX "fixed_assets_companyId_category_idx" ON "fixed_assets"("companyId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "fixed_assets_companyId_assetNumber_key" ON "fixed_assets"("companyId", "assetNumber");

-- CreateIndex
CREATE INDEX "depreciation_records_fiscalPeriodId_idx" ON "depreciation_records"("fiscalPeriodId");

-- CreateIndex
CREATE UNIQUE INDEX "depreciation_records_assetId_fiscalPeriodId_key" ON "depreciation_records"("assetId", "fiscalPeriodId");

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_costAccountId_fkey" FOREIGN KEY ("costAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_accDepAccountId_fkey" FOREIGN KEY ("accDepAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_depExpAccountId_fkey" FOREIGN KEY ("depExpAccountId") REFERENCES "chart_of_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_records" ADD CONSTRAINT "depreciation_records_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "fixed_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depreciation_records" ADD CONSTRAINT "depreciation_records_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
