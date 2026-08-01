import 'dotenv/config';
import { createClient } from '@libsql/client';
import { execSync } from 'node:child_process';

describe('Prisma Schema and Seed', () => {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const client = createClient({ url: databaseUrl });

  afterAll(() => {
    client.close();
  });

  describe('table structure', () => {
    it('has all 7 tables', async () => {
      const result = await client.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma_%' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      );
      const tables = result.rows.map((row) => row[0] as string);

      expect(tables).toEqual([
        'Resume',
        'ResumeSection',
        'Section',
        'SectionEntry',
        'SectionField',
        'Session',
        'User',
      ]);
    });

    it('has unique index on User.email', async () => {
      const result = await client.execute(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='User' AND name='User_email_key'`,
      );
      expect(result.rows).toHaveLength(1);
    });

    it('has unique index on Session.token', async () => {
      const result = await client.execute(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='Session' AND name='Session_token_key'`,
      );
      expect(result.rows).toHaveLength(1);
    });

    it('has updatedAt column on User', async () => {
      const result = await client.execute('PRAGMA table_info(User)');
      const columns = result.rows.map((row) => row[1] as string);
      expect(columns).toContain('updatedAt');
    });

    it('has unique constraint on ResumeSection(resumeId, sectionId)', async () => {
      const result = await client.execute(
        `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='ResumeSection' AND name='ResumeSection_resumeId_sectionId_key'`,
      );
      expect(result.rows).toHaveLength(1);
    });
  });

  describe('Section seed', () => {
    beforeAll(() => {
      execSync('npx tsx prisma/seed.ts', {
        cwd: process.cwd(),
        env: { ...process.env },
        encoding: 'utf-8',
        stdio: 'pipe',
      });
    });

    it('inserts exactly 10 Section rows', async () => {
      const result = await client.execute(
        'SELECT COUNT(*) as count FROM Section',
      );
      const count = Number(result.rows[0]?.[0]);
      expect(count).toBe(10);
    });

    it('contains all expected section keys', async () => {
      const result = await client.execute(
        'SELECT id, label FROM Section ORDER BY id',
      );
      const sections = result.rows.map((row) => ({
        id: row[0] as string,
        label: row[1] as string,
      }));

      expect(sections).toEqual([
        { id: 'certifications', label: 'Certifications' },
        { id: 'education', label: 'Education' },
        { id: 'experience', label: 'Experience' },
        { id: 'hard_skills', label: 'Hard Skills' },
        { id: 'hobbies', label: 'Hobbies' },
        { id: 'languages', label: 'Languages' },
        { id: 'name_contact', label: 'Name & Contact' },
        { id: 'projects', label: 'Projects' },
        { id: 'soft_skills', label: 'Soft Skills' },
        { id: 'summary', label: 'Summary' },
      ]);
    });

    it('is idempotent when seed runs again', async () => {
      const result = execSync('npx tsx prisma/seed.ts', {
        cwd: process.cwd(),
        env: { ...process.env },
        encoding: 'utf-8',
      });

      expect(result).toContain('Seeded 10 sections');

      const countResult = await client.execute(
        'SELECT COUNT(*) as count FROM Section',
      );
      const count = Number(countResult.rows[0]?.[0]);
      expect(count).toBe(10);
    });
  });

  describe('foreign key constraints', () => {
    const userId = 'test-fk-user';
    const resumeId = 'test-fk-resume';
    const sectionId = 'test-fk-ressection';
    const parentEntryId = 'test-fk-parent';
    const childEntryId = 'test-fk-child';

    beforeAll(async () => {
      await client.execute(
        "INSERT OR IGNORE INTO User (id, email, password, createdAt, updatedAt) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
        [userId, 'fk-test@example.com', 'pw'],
      );
      await client.execute(
        "INSERT OR IGNORE INTO Resume (id, userId, layout, name, createdAt, updatedAt) VALUES (?, ?, 'standard', NULL, datetime('now'), datetime('now'))",
        [resumeId, userId],
      );
      await client.execute(
        'INSERT OR IGNORE INTO ResumeSection (id, resumeId, sectionId, [order]) VALUES (?, ?, ?, 0)',
        [sectionId, resumeId, 'summary'],
      );
    });

    afterAll(async () => {
      await client.execute('DELETE FROM User WHERE id = ?', [userId]);
    });

    it('enforces cascade delete from User to Resume', async () => {
      const cascadeUserId = 'test-cascade-user';
      const cascadeResumeId = 'test-cascade-resume';

      await client.execute(
        "INSERT OR IGNORE INTO User (id, email, password, createdAt, updatedAt) VALUES (?, ?, ?, datetime('now'), datetime('now'))",
        [cascadeUserId, 'cascade@test.com', 'pw'],
      );
      await client.execute(
        "INSERT OR IGNORE INTO Resume (id, userId, layout, name, createdAt, updatedAt) VALUES (?, ?, 'standard', NULL, datetime('now'), datetime('now'))",
        [cascadeResumeId, cascadeUserId],
      );

      await client.execute('DELETE FROM User WHERE id = ?', [cascadeUserId]);

      const result = await client.execute(
        'SELECT COUNT(*) as count FROM Resume WHERE id = ?',
        [cascadeResumeId],
      );
      const count = Number(result.rows[0]?.[0]);
      expect(count).toBe(0);
    });

    it('enforces cascade delete from User to Session', async () => {
      const sessionUserId = 'test-cascade-session-user';
      const sessionId = 'test-cascade-session';

      await client.execute(
        "INSERT OR IGNORE INTO User (id, email, password, createdAt) VALUES (?, ?, ?, datetime('now'))",
        [sessionUserId, 'session-cascade@test.com', 'pw'],
      );
      await client.execute(
        "INSERT OR IGNORE INTO Session (id, userId, token, createdAt) VALUES (?, ?, ?, datetime('now'))",
        [sessionId, sessionUserId, 'unique-token-hash'],
      );

      await client.execute('DELETE FROM User WHERE id = ?', [sessionUserId]);

      const result = await client.execute(
        'SELECT COUNT(*) as count FROM Session WHERE id = ?',
        [sessionId],
      );
      const count = Number(result.rows[0]?.[0]);
      expect(count).toBe(0);
    });

    it('enforces unique constraint on Session.token', async () => {
      const tokenUserId = 'test-unique-token-user';

      await client.execute(
        "INSERT OR IGNORE INTO User (id, email, password, createdAt) VALUES (?, ?, ?, datetime('now'))",
        [tokenUserId, 'unique-token@test.com', 'pw'],
      );
      await client.execute(
        "INSERT OR IGNORE INTO Session (id, userId, token, createdAt) VALUES (?, ?, ?, datetime('now'))",
        ['sess-unique-1', tokenUserId, 'duplicate-token'],
      );

      await expect(
        client.execute(
          "INSERT INTO Session (id, userId, token, createdAt) VALUES (?, ?, ?, datetime('now'))",
          ['sess-unique-2', tokenUserId, 'duplicate-token'],
        ),
      ).rejects.toThrow();

      // Cleanup
      await client.execute('DELETE FROM User WHERE id = ?', [tokenUserId]);
    });

    it('enforces SET NULL on SectionEntry parent delete', async () => {
      await client.execute(
        'INSERT OR IGNORE INTO SectionEntry (id, resumeSectionId, [order]) VALUES (?, ?, 0)',
        [parentEntryId, sectionId],
      );
      await client.execute(
        'INSERT OR IGNORE INTO SectionEntry (id, resumeSectionId, [order], parentId) VALUES (?, ?, 0, ?)',
        [childEntryId, sectionId, parentEntryId],
      );

      await client.execute('DELETE FROM SectionEntry WHERE id = ?', [
        parentEntryId,
      ]);

      const result = await client.execute(
        'SELECT parentId FROM SectionEntry WHERE id = ?',
        [childEntryId],
      );
      expect(result.rows[0]?.[0]).toBeNull();
    });
  });
});
