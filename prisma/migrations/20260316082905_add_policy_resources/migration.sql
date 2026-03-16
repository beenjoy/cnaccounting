-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PolicyResource" ADD VALUE 'FIXED_ASSET';
ALTER TYPE "PolicyResource" ADD VALUE 'AR_INVOICE';
ALTER TYPE "PolicyResource" ADD VALUE 'AP_INVOICE';
ALTER TYPE "PolicyResource" ADD VALUE 'VAT_RECORD';
