---
name: sql-query
description: Query the project database and show results. Use for verification, debugging, and PR proof sections. Triggers on "query database", "show rows", "sql", "database state", "check db".
---

# SQL Query

Run SQL queries against the project database and capture the full output.
Use this to verify database state in PR "Setup & Verification" and "Proof of Changes" sections.

## Prerequisites

The project uses SQLite via Prisma. The database is at `backend/prisma/dev.db`.

## How to Query

**Always enable timing.**

### Option A: sqlite3 CLI with timer (preferred)

```bash
sqlite3 backend/prisma/dev.db -column -header ".timer on" "SELECT * FROM <table> LIMIT 20;"
```

Or interactively:

```bash
sqlite3 backend/prisma/dev.db
.timer on
.mode column
.headers on
SELECT * FROM Section;
```

**Output will include:**
```
id              label
--------------  --------------
name_contact    Name & Contact
...
Run Time: real 0.002 user 0.001234 sys 0.000000
```

### Option B: Prisma Studio (for exploration, not PR output)

```bash
cd backend && npx prisma studio
```

This opens a browser GUI. Not suitable for PR proof sections.

### Option C: npx tsx inline script (for complex queries)

```bash
npx tsx -e "
const { PrismaClient } = require('./backend/src/generated/prisma');
const prisma = new PrismaClient();
prisma.user.findMany().then(u => { console.log(JSON.stringify(u, null, 2)); prisma.\$disconnect(); });
"
```

## Output Requirements for PR

When including database state in a PR:

1. **Show the full command** in a code block with `.timer on`
2. **Show the full output** (not a summary) — the timer output proves duration
3. **State your assertion** — what does this output prove? Start with ✓ or ✗.

### Example PR Section

```
### AC-3: User row persists after registration
**What this tests:** After a successful signup, the database contains exactly one User row with hashed password.

**Test:**
\`\`\`bash
$ sqlite3 backend/prisma/dev.db -column -header ".timer on" "SELECT id, email, createdAt FROM User;"
\`\`\`

**Result:** Verifies that a User row exists with UUID primary key, correct email, and timestamp.
\`\`\`
id                                   email              createdAt
------------------------------------ ------------------ -------------------
a1b2c3d4-e5f6-7890-abcd-ef1234567890 test@example.com   2026-08-01T12:00:00
Run Time: real 0.003 user 0.001234 sys 0.000000
\`\`\`

**Assertion:** ✓ User created — email matches, 3ms query confirms row at rest in SQLite
```

**Always include:**
- `.timer on` for every sqlite3 query
- An assertion line starting with ✓ or ✗ explaining what was verified
- Duration in the output

## Query Reference

Common tables and their schemas are defined in `backend/prisma/schema.prisma`:

| Table | Key columns |
|-------|------------|
| User | id, email, password, createdAt |
| Resume | id, userId, layout, name, createdAt, updatedAt |
| Section | id (key), label |
| ResumeSection | id, resumeId, sectionId, column, order |
| SectionEntry | id, resumeSectionId, order, parentId |
| SectionField | id, sectionEntryId, key, value, order |
