-- Seed reference data for the "Section" table.
--
-- The app hard-requires these rows: every resume payload's sectionId is
-- FK-constrained to Section.id (ResumeSection_sectionId_fkey), and the
-- frontend only ever sends the 11 ids below. Migrations only ever created
-- the EMPTY table — the rows were added by the manual `prisma db seed`,
-- which was never run against production. Result (observed 2026-08-07,
-- prod): every autosave POST /api/v1/resumes 500'd with "Foreign key
-- constraint violated on the constraint: ResumeSection_sectionId_fkey".
--
-- Keep this list in sync with frontend SECTION_TYPES
-- (frontend/src/features/builder/types/resume.ts) and prisma/seed.ts.
-- ON CONFLICT DO NOTHING keeps this idempotent for DBs already seeded by
-- `prisma db seed` (local dev).
INSERT INTO "Section" ("id", "label") VALUES
  ('name_contact', 'Name & Contact'),
  ('summary', 'Summary'),
  ('experience', 'Experience'),
  ('education', 'Education'),
  ('hard_skills', 'Hard Skills'),
  ('soft_skills', 'Soft Skills'),
  ('projects', 'Projects'),
  ('certifications', 'Certifications'),
  ('languages', 'Languages'),
  ('hobbies', 'Hobbies'),
  ('volunteer', 'Volunteer')
ON CONFLICT ("id") DO NOTHING;
