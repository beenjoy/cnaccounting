-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('CURRENT_ASSET', 'NON_CURRENT_ASSET', 'CURRENT_LIABILITY', 'NON_CURRENT_LIABILITY', 'EQUITY_ITEM', 'OPERATING_REVENUE', 'OPERATING_COST', 'PERIOD_EXPENSE', 'NON_OPERATING_INCOME', 'NON_OPERATING_EXPENSE', 'INCOME_TAX');

-- CreateEnum
CREATE TYPE "CashFlowActivity" AS ENUM ('OPERATING', 'INVESTING', 'FINANCING');

-- AlterTable
ALTER TABLE "chart_of_accounts" ADD COLUMN     "reportCategory" "ReportCategory";

-- AlterTable
ALTER TABLE "journal_entry_lines" ADD COLUMN     "cashFlowActivity" "CashFlowActivity";
