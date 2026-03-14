-- CreateEnum
CREATE TYPE "VATDirection" AS ENUM ('SALES', 'PURCHASE');

-- CreateEnum
CREATE TYPE "VATInvoiceType" AS ENUM ('SPECIAL_VAT', 'GENERAL_VAT', 'ELECTRONIC_VAT', 'TOLL_ROAD', 'OTHER');

-- CreateTable
CREATE TABLE "vat_configs" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "taxpayerType" "VATType" NOT NULL DEFAULT 'GENERAL_TAXPAYER',
    "standardRate" DECIMAL(5,4) NOT NULL DEFAULT 0.13,
    "reducedRates" JSONB,
    "urbanMaintenanceRate" DECIMAL(5,4) NOT NULL DEFAULT 0.07,
    "educationSurcharge" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "localEducation" DECIMAL(5,4) NOT NULL DEFAULT 0.02,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vat_records" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "fiscalPeriodId" TEXT,
    "direction" "VATDirection" NOT NULL,
    "invoiceType" "VATInvoiceType" NOT NULL DEFAULT 'SPECIAL_VAT',
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "counterparty" TEXT NOT NULL,
    "counterpartyTaxId" TEXT,
    "amount" DECIMAL(20,2) NOT NULL,
    "taxRate" DECIMAL(5,4) NOT NULL,
    "taxAmount" DECIMAL(20,2) NOT NULL,
    "deductible" BOOLEAN NOT NULL DEFAULT true,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vat_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vat_configs_companyId_key" ON "vat_configs"("companyId");

-- CreateIndex
CREATE INDEX "vat_records_companyId_direction_idx" ON "vat_records"("companyId", "direction");

-- CreateIndex
CREATE INDEX "vat_records_companyId_fiscalPeriodId_idx" ON "vat_records"("companyId", "fiscalPeriodId");

-- CreateIndex
CREATE INDEX "vat_records_invoiceDate_idx" ON "vat_records"("invoiceDate");

-- AddForeignKey
ALTER TABLE "vat_configs" ADD CONSTRAINT "vat_configs_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_records" ADD CONSTRAINT "vat_records_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vat_records" ADD CONSTRAINT "vat_records_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "fiscal_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;
