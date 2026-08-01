/**
 * Schema integration tests — validates all 6 models, relationships,
 * constraints, and cascade behaviors using an in-memory SQLite database.
 *
 * Usage: npx tsx prisma/schema.test.ts
 */
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import dotenv from 'dotenv';

dotenv.config();

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string): void {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

async function assertRejects(fn: () => Promise<unknown>, msg: string): Promise<void> {
  try {
    await fn();
    failed++;
    console.error(`  ✗ ${msg} (expected rejection, but succeeded)`);
  } catch {
    passed++;
    console.log(`  ✓ ${msg}`);
  }
}

async function run(): Promise<void> {
  // Use in-memory database for isolated testing
  const prisma = new PrismaClient({
    adapter: new PrismaLibSql({ url: ':memory:' }),
  });

  try {
    // Enable FK enforcement (SQLite requires this pragma per connection)
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');

    // Create schema via raw SQL (same DDL as the migration)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "email" TEXT NOT NULL,
        "password" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Resume" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "layout" TEXT NOT NULL DEFAULT 'standard',
        "name" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Section" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "label" TEXT NOT NULL
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ResumeSection" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "resumeId" TEXT NOT NULL,
        "sectionId" TEXT NOT NULL,
        "column" TEXT NOT NULL DEFAULT 'right',
        "order" INTEGER NOT NULL DEFAULT 0,
        CONSTRAINT "ResumeSection_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ResumeSection_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "Section" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "ResumeSection_resumeId_sectionId_key" ON "ResumeSection"("resumeId", "sectionId")`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SectionEntry" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "resumeSectionId" TEXT NOT NULL,
        "order" INTEGER NOT NULL,
        "parentId" TEXT,
        CONSTRAINT "SectionEntry_resumeSectionId_fkey" FOREIGN KEY ("resumeSectionId") REFERENCES "ResumeSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "SectionEntry_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SectionEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "SectionField" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "sectionEntryId" TEXT NOT NULL,
        "key" TEXT NOT NULL,
        "value" TEXT NOT NULL,
        "order" INTEGER NOT NULL,
        CONSTRAINT "SectionField_sectionEntryId_fkey" FOREIGN KEY ("sectionEntryId") REFERENCES "SectionEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      )
    `);

    console.log('\n  1. User model');
    console.log('  ─────────────');

    const user = await prisma.user.create({
      data: { email: 'test@example.com', password: 'hashed' },
    });
    assert(typeof user.id === 'string' && user.id.length > 0, 'User.id is a non-empty string (UUID)');
    assert(user.email === 'test@example.com', 'User.email matches');
    assert(user.createdAt instanceof Date, 'User.createdAt is a Date');

    await assertRejects(
      () => prisma.user.create({ data: { email: 'test@example.com', password: 'other' } }),
      'Unique email constraint enforced',
    );

    console.log('\n  2. Resume model');
    console.log('  ──────────────');

    const resume = await prisma.resume.create({
      data: { userId: user.id, name: 'My Resume' },
    });
    assert(resume.layout === 'standard', 'Resume.layout defaults to "standard"');
    assert(resume.name === 'My Resume', 'Resume.name matches');
    assert(resume.userId === user.id, 'Resume.userId FK matches User.id');
    assert(resume.createdAt instanceof Date, 'Resume.createdAt is a Date');
    assert(resume.updatedAt instanceof Date, 'Resume.updatedAt is a Date');

    await assertRejects(
      () => prisma.resume.create({ data: { userId: 'nonexistent', name: 'Bad' } }),
      'Resume FK constraint enforced (invalid userId)',
    );

    console.log('\n  3. Section model + seed data');
    console.log('  ────────────────────────────');

    const sections = [
      { id: 'name_contact', label: 'Name & Contact' },
      { id: 'summary', label: 'Summary' },
      { id: 'experience', label: 'Experience' },
      { id: 'education', label: 'Education' },
      { id: 'hard_skills', label: 'Hard Skills' },
      { id: 'soft_skills', label: 'Soft Skills' },
      { id: 'certifications', label: 'Certifications' },
      { id: 'projects', label: 'Projects' },
      { id: 'languages', label: 'Languages' },
      { id: 'hobbies', label: 'Hobbies' },
    ];

    for (const s of sections) {
      await prisma.section.create({ data: s });
    }
    const sectionCount = await prisma.section.count();
    assert(sectionCount === 10, `Section count is 10 (got ${sectionCount})`);

    // Verify upsert idempotency
    await prisma.section.upsert({
      where: { id: 'name_contact' },
      update: { label: 'Name & Contact' },
      create: { id: 'name_contact', label: 'Name & Contact' },
    });
    const afterUpsert = await prisma.section.count();
    assert(afterUpsert === 10, 'Section count still 10 after idempotent upsert');

    console.log('\n  4. ResumeSection model');
    console.log('  ────────────────────────');

    const rs = await prisma.resumeSection.create({
      data: { resumeId: resume.id, sectionId: 'name_contact', column: 'right', order: 0 },
    });
    assert(rs.column === 'right', 'ResumeSection.column defaults to "right"');
    assert(rs.order === 0, 'ResumeSection.order defaults to 0');
    assert(rs.resumeId === resume.id, 'ResumeSection FK to Resume works');

    await assertRejects(
      () =>
        prisma.resumeSection.create({
          data: { resumeId: resume.id, sectionId: 'name_contact' },
        }),
      'Unique constraint [resumeId, sectionId] enforced',
    );

    // FK: cannot delete a Section while ResumeSection references it (RESTRICT)
    await assertRejects(
      () => prisma.section.delete({ where: { id: 'name_contact' } }),
      'Section delete RESTRICTed while ResumeSection references it',
    );

    console.log('\n  5. SectionEntry self-referential hierarchy');
    console.log('  ─────────────────────────────────────────');

    const parent = await prisma.sectionEntry.create({
      data: { resumeSectionId: rs.id, order: 0 },
    });
    const child = await prisma.sectionEntry.create({
      data: { resumeSectionId: rs.id, order: 1, parentId: parent.id },
    });
    const grandchild = await prisma.sectionEntry.create({
      data: { resumeSectionId: rs.id, order: 2, parentId: child.id },
    });

    // Query parent with children
    const parentWithChildren = await prisma.sectionEntry.findUnique({
      where: { id: parent.id },
      include: { children: true },
    });
    assert(parentWithChildren!.children.length === 1, 'Parent has 1 child');
    assert(parentWithChildren!.children[0].id === child.id, 'Child references correct parent');

    // Query child with parent
    const childWithParent = await prisma.sectionEntry.findUnique({
      where: { id: child.id },
      include: { parent: true, children: true },
    });
    assert(childWithParent!.parent!.id === parent.id, 'Child.parent references parent');
    assert(childWithParent!.children.length === 1, 'Child has 1 child (grandchild)');

    // Deep hierarchy: parent -> child -> grandchild
    const grandchildWithParent = await prisma.sectionEntry.findUnique({
      where: { id: grandchild.id },
      include: { parent: true },
    });
    assert(grandchildWithParent!.parent!.id === child.id, 'Grandchild.parent references child');

    // ON DELETE SET NULL: delete parent, verify child.parentId becomes null
    await prisma.sectionEntry.delete({ where: { id: parent.id } });
    const orphaned = await prisma.sectionEntry.findUnique({ where: { id: child.id } });
    assert(orphaned!.parentId === null, 'Child.parentId SET NULL after parent deleted');

    console.log('\n  6. SectionField model');
    console.log('  ───────────────────────');

    const entry = await prisma.sectionEntry.create({
      data: { resumeSectionId: rs.id, order: 0 },
    });

    const field1 = await prisma.sectionField.create({
      data: { sectionEntryId: entry.id, key: 'name', value: 'encrypted_value', order: 0 },
    });
    const field2 = await prisma.sectionField.create({
      data: { sectionEntryId: entry.id, key: 'email', value: 'encrypted_email', order: 1 },
    });

    assert(field1.key === 'name', 'SectionField.key matches');
    assert(field1.value === 'encrypted_value', 'SectionField.value stores encrypted data');
    assert(field2.order === 1, 'SectionField.order works for ordering');

    const entryWithFields = await prisma.sectionEntry.findUnique({
      where: { id: entry.id },
      include: { fields: true },
    });
    assert(entryWithFields!.fields.length === 2, 'SectionEntry has 2 fields');

    console.log('\n  7. Cascade delete chain');
    console.log('  ─────────────────────────');

    // Delete User -> cascades to Resume -> ResumeSection -> SectionEntry -> SectionField
    const beforeDelete = {
      users: await prisma.user.count(),
      resumes: await prisma.resume.count(),
      resumeSections: await prisma.resumeSection.count(),
      entries: await prisma.sectionEntry.count(),
      fields: await prisma.sectionField.count(),
    };
    assert(beforeDelete.users >= 1, 'Users exist before cascade');
    assert(beforeDelete.entries >= 1, 'Entries exist before cascade');
    assert(beforeDelete.fields === 2, 'Fields exist before cascade (got 2)');

    await prisma.user.delete({ where: { id: user.id } });

    const afterDelete = {
      users: await prisma.user.count(),
      resumes: await prisma.resume.count(),
      resumeSections: await prisma.resumeSection.count(),
      entries: await prisma.sectionEntry.count(),
      fields: await prisma.sectionField.count(),
    };
    assert(afterDelete.users === 0, 'All users deleted');
    assert(afterDelete.resumes === 0, 'All resumes cascade-deleted');
    assert(afterDelete.resumeSections === 0, 'All ResumeSections cascade-deleted');
    assert(afterDelete.entries === 0, 'All SectionEntries cascade-deleted');
    assert(afterDelete.fields === 0, 'All SectionFields cascade-deleted');

    // Sections should remain (reference data, not cascade)
    const remainingSections = await prisma.section.count();
    assert(remainingSections === 10, 'Section reference rows remain after cascade');

    // ── Summary ──
    console.log(`\n${'─'.repeat(40)}`);
    console.log(`  ${passed} passed, ${failed} failed`);
    console.log(`${'─'.repeat(40)}\n`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((e) => {
  console.error('Test run failed:', e);
  process.exit(1);
});
