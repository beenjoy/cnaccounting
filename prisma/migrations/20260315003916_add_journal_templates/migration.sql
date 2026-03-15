-- CreateTable
CREATE TABLE "journal_templates" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_template_lines" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountCode" TEXT,
    "accountName" TEXT,
    "direction" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "journal_template_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "journal_templates_companyId_category_idx" ON "journal_templates"("companyId", "category");

-- CreateIndex
CREATE INDEX "journal_template_lines_templateId_idx" ON "journal_template_lines"("templateId");

-- AddForeignKey
ALTER TABLE "journal_templates" ADD CONSTRAINT "journal_templates_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_template_lines" ADD CONSTRAINT "journal_template_lines_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "journal_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
