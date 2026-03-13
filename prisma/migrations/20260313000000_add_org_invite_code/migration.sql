-- Add inviteCode to organizations with a SQL-level default so existing rows get values
ALTER TABLE "organizations" ADD COLUMN "inviteCode" TEXT;

-- Populate existing rows with unique cuid-like values using gen_random_uuid()
UPDATE "organizations" SET "inviteCode" = replace(gen_random_uuid()::text, '-', '') WHERE "inviteCode" IS NULL;

-- Make the column required and add unique constraint
ALTER TABLE "organizations" ALTER COLUMN "inviteCode" SET NOT NULL;
CREATE UNIQUE INDEX "organizations_inviteCode_key" ON "organizations"("inviteCode");
