-- Seed reference data for the "Section" table (SQLite chain).
--
-- Same contract as migrations-postgresql/20260808000000_seed_sections:
-- the app FK-requires these rows (ResumeSection.sectionId -> Section.id)
-- and migrations only ever created the empty table. Local dev DBs happened
-- to be seeded by a manual `prisma db seed`; fresh DBs never were, and
-- would 500 on the first autosave with ResumeSection_sectionId_fkey.
-- INSERT OR IGNORE is a no-op on already-seeded DBs (local dev.db).
--
-- Keep this list in sync with frontend SECTION_TYPES
-- (frontend/src/features/builder/types/resume.ts) and prisma/seed.ts.
INSERT OR IGNORE INTO "Section" ("id", "label") VALUES
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
  ('volunteer', 'Volunteer');
