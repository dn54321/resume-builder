-- AlterTable
-- RES-94: close schema drift so a fresh `prisma migrate deploy` produces a
-- database that exactly matches schema.prisma.
--   * SectionField.iv / authTag  — added to schema in RES-17 (AES-256-GCM
--     encrypted field storage) but no migration was ever created. The resumes
--     service writes these columns on every save, so a fresh migrated DB
--     without them crashes at runtime ("no such column: iv").
--   * ResumeSection.enabled      — added to schema in RES-93; its migration
--     (20260806_add_enabled_to_resume_section) was reverted in 11643bd.
-- Fresh DBs are empty at this point, so NOT NULL without DEFAULT is valid.
ALTER TABLE "SectionField" ADD COLUMN "iv" TEXT NOT NULL;
ALTER TABLE "SectionField" ADD COLUMN "authTag" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ResumeSection" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;
