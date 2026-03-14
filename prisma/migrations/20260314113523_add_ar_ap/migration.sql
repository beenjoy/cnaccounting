-- CreateEnum
CREATE TYPE "ARInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "APInvoiceStatus" AS ENUM ('DRAFT', 'OPEN', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentTerms" AS ENUM ('NET_30', 'NET_60', 'NET_90', 'IMMEDIATE', 'CUSTOM');

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "creditLimit" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'NET_30',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxId" TEXT,
    "contactName" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "paymentTerms" "PaymentTerms" NOT NULL DEFAULT 'NET_30',
    "bankAccount" TEXT,
    "bankName" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_invoices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,2) NOT NULL,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,2) NOT NULL,
    "paidAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "ARInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "journalEntryId" TEXT,
    "fiscalPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ar_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap_invoices" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "subtotal" DECIMAL(20,2) NOT NULL,
    "taxAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(20,2) NOT NULL,
    "paidAmount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "status" "APInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT,
    "journalEntryId" TEXT,
    "fiscalPeriodId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ap_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ar_matchings" (
    "id" TEXT NOT NULL,
    "arInvoiceId" TEXT NOT NULL,
    "journalEntryLineId" TEXT NOT NULL,
    "matchedAmount" DECIMAL(20,2) NOT NULL,
    "matchedDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ar_matchings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ap_matchings" (
    "id" TEXT NOT NULL,
    "apInvoiceId" TEXT NOT NULL,
    "journalEntryLineId" TEXT NOT NULL,
    "matchedAmount" DECIMAL(20,2) NOT NULL,
    "matchedDate" DATE NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ap_matchings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customers_companyId_idx" ON "customers"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_companyId_code_key" ON "customers"("companyId", "code");

-- CreateIndex
CREATE INDEX "vendors_companyId_idx" ON "vendors"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "vendors_companyId_code_key" ON "vendors"("companyId", "code");

-- CreateIndex
CREATE INDEX "ar_invoices_companyId_status_idx" ON "ar_invoices"("companyId", "status");

-- CreateIndex
CREATE INDEX "ar_invoices_customerId_idx" ON "ar_invoices"("customerId");

-- CreateIndex
CREATE INDEX "ar_invoices_dueDate_idx" ON "ar_invoices"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ar_invoices_companyId_invoiceNumber_key" ON "ar_invoices"("companyId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "ap_invoices_companyId_status_idx" ON "ap_invoices"("companyId", "status");

-- CreateIndex
CREATE INDEX "ap_invoices_vendorId_idx" ON "ap_invoices"("vendorId");

-- CreateIndex
CREATE INDEX "ap_invoices_dueDate_idx" ON "ap_invoices"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ap_invoices_companyId_invoiceNumber_key" ON "ap_invoices"("companyId", "invoiceNumber");

-- CreateIndex
CREATE INDEX "ar_matchings_arInvoiceId_idx" ON "ar_matchings"("arInvoiceId");

-- CreateIndex
CREATE INDEX "ar_matchings_journalEntryLineId_idx" ON "ar_matchings"("journalEntryLineId");

-- CreateIndex
CREATE INDEX "ap_matchings_apInvoiceId_idx" ON "ap_matchings"("apInvoiceId");

-- CreateIndex
CREATE INDEX "ap_matchings_journalEntryLineId_idx" ON "ap_matchings"("journalEntryLineId");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_invoices" ADD CONSTRAINT "ar_invoices_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoices" ADD CONSTRAINT "ap_invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_invoices" ADD CONSTRAINT "ap_invoices_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "vendors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_matchings" ADD CONSTRAINT "ar_matchings_arInvoiceId_fkey" FOREIGN KEY ("arInvoiceId") REFERENCES "ar_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ar_matchings" ADD CONSTRAINT "ar_matchings_journalEntryLineId_fkey" FOREIGN KEY ("journalEntryLineId") REFERENCES "journal_entry_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_matchings" ADD CONSTRAINT "ap_matchings_apInvoiceId_fkey" FOREIGN KEY ("apInvoiceId") REFERENCES "ap_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ap_matchings" ADD CONSTRAINT "ap_matchings_journalEntryLineId_fkey" FOREIGN KEY ("journalEntryLineId") REFERENCES "journal_entry_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
