---
name: plan-ticket
description: Generate a structured ticket plan from a milestone spec, write tickets to the milestone's tickets/ folder, iterate with the user, then create them in Linear. Triggers on "plan ticket", "create tickets", "ticket plan", "generate tickets".
argument-hint: "[milestone-name] [--force]"
---

# Plan Ticket

Takes a milestone name (e.g., `2026-07-31-152550-resume-builder`), reads its `SPEC.md`, generates a structured ticket breakdown, writes it to a `tickets/` folder in the milestone directory, iterates with the user, and then creates the tickets in Linear.

## `--force` Flag

When `--force` is passed, the skill **skips Phase 4 entirely** — no iteration, no confirmation prompt. After writing the plan, it proceeds directly to Phase 5 and creates all tickets in Linear without asking. The only interaction required is resolving the Linear team (inferred from context if possible, otherwise queried once).

Usage:
```
plan ticket for dashboard-builder-ux-overhaul --force
```

## Phase 1 — Read the Spec

Locate the milestone directory:

```
milestones/<milestone-name>/
├── SPEC.md
```

Read `SPEC.md` completely. If the milestone directory or spec does not exist, tell the user and stop.

Extract from the spec:
- **User Stories** — each becomes an Epic in Linear
- **Acceptance Criteria** — each criterion should map to one or more tickets
- **API Endpoints** — each endpoint or logical group is a backend ticket
- **Frontend Routes/Pages** — each route or page is a frontend ticket
- **Technical Approach** — infrastructure/setup work becomes tickets
- **Dependencies** — these inform `ref:` ordering between tickets

## Phase 2 — Tag Convention

Assign a 2-4 letter uppercase tag to each distinct feature area. Tags appear in brackets in ticket titles.

**Tag mapping rules:**
- Auth / sessions → `[AUTH]`
- Resume CRUD / data model → `[RES]`
- Tailor / JD filtering / matching engine → `[TAILOR]`
- Frontend builder UI / editor → `[BUILD]`
- Frontend preview → `[PREVIEW]`
- PDF export → `[PDF]`
- Infrastructure / setup / config → `[INFRA]`
- Database / schema → `[DB]`
- Encryption / security → `[CRYPTO]`
- End-to-end / integration tests → `[E2E]`

Derive new tags as needed from the feature area. Keep tags short (2-6 chars), uppercase, and consistent across all tickets in the milestone.

## Phase 3 — Generate Ticket Plan

### Epic Structure

Each **user story** from the spec becomes an **Epic** in Linear. An epic represents a complete user flow. Epics are written in non-technical, user-centric language.

**Epic naming:** Start with a verb. Example: *"Build and export a tailored resume"*

### Ticket Structure

Tickets implement either:
- **A backend feature** (a module, an endpoint group, a service, or a schema migration)
- **A frontend page or feature** (a route/view, a major component, or a composable group)
- **An e2e test** (a Playwright or supertest-based test covering a complete user flow end-to-end with real database and browser)

Every ticket **must** be self-contained — all information needed to implement it is in the ticket description. A developer should not need to cross-reference the spec.

### Core Flow E2E Tickets (REQUIRED)

Every milestone that introduces or modifies a **user-facing flow** MUST include e2e test tickets. Core flows are paths through the application that a user takes to accomplish a goal:

| Core Flow | Requires E2E Test |
|-----------|-------------------|
| Sign up / Register | ✅ Always |
| Log in / Log out | ✅ Always |
| Session persistence (me, token refresh) | ✅ Always |
| Create resource (resume, document, etc.) | ✅ If new resource type |
| Edit / Update resource | ✅ If new editor |
| Delete resource | ✅ If new deletion flow |
| Export / Download | ✅ If new export format |
| Navigation (routing, protected routes) | ✅ If new routes |
| Error states (404, 500, validation) | ✅ If new error handling |

E2e tickets follow this naming convention: `[E2E] <flow description>`

Example e2e tickets:
- `[E2E] Signup and login flow with real database`
- `[E2E] Session persistence and logout across page reloads`
- `[E2E] Resume CRUD lifecycle (create → edit → export → delete)`

**E2e ticket description format:**

```markdown
ref: <all tickets that implement the flow being tested>

## Summary
End-to-end test covering the complete <flow-name> flow using <supertest|Playwright> with a real database.

## What to Build
- Test file: `<path/to/test.e2e.spec.ts>` or `<path/to/test.spec.ts>`
- Uses real database (SQLite in-memory or test file)
- Covers all states: success, validation errors, auth errors, edge cases

### Flow Steps
1. <step 1>
2. <step 2>
...

## Acceptance Criteria
- [ ] All flow steps pass with real database
- [ ] Covers happy path (201/200)
- [ ] Covers error states (400, 401, 409)
- [ ] Covers edge cases (duplicate, invalid token, expired session)
- [ ] Database state verified after each mutation
- [ ] ≥90% coverage on tested endpoints

## Technical Notes
- Use supertest for backend flows, Playwright for browser flows
- Clean up test data in afterAll/afterEach
- Use unique emails/timestamps to avoid collisions
```

**Ticket naming:** `[TAG] Verb-first action-oriented title`

Examples:
- `[AUTH] Implement signup and login endpoints`
- `[DB] Create Prisma schema and run initial migration`
- `[BUILD] Create ResumeBuilder page with section toggling`

### Ticket Description Format

Every ticket description follows this exact structure:

```markdown
ref: <list of ticket identifiers required before this one, space-separated>

## Summary
One paragraph explaining what this ticket delivers and why.

## What to Build
Specific, detailed instructions:
- Files to create or modify (with paths)
- Functions/classes/components to implement
- API contracts if relevant
- Props/inputs and outputs

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Technical Notes
- Dependencies, libraries, or services needed
- Edge cases and error states to handle
- Performance or security considerations
```

The first line **must** be `ref:` followed by ticket identifiers. If the ticket has no dependencies, write `ref: none`.

### Ticket Identifiers

Use a simple sequential naming scheme for the tickets file: `T-001`, `T-002`, etc. These are the identifiers used in `ref:` lines. When creating in Linear, the Linear issue key (e.g., `RES-5`) replaces these in the `ref:` line.

### Ordering

Tickets are ordered so that foundational work comes first:
1. Database schema & migrations (backend)
2. Infrastructure / config (backend)
3. API modules (backend)
4. Frontend pages (frontend)
5. Integration / polish

Within each epic, tickets follow the same foundational-first ordering.
E2e test tickets always come LAST in their epic — they depend on
all implementation tickets being complete.

### Plan File Format

Write the plan to `milestones/<milestone-name>/tickets/PLAN.md`:

```markdown
# Ticket Plan — [Milestone Title]

**Milestone:** milestones/<milestone-name>/SPEC.md
**Date:** YYYY-MM-DD HH:MM:SS UTC
**Total Tickets:** N

## Epics

| # | Epic Title | User Story | Tickets |
|---|------------|------------|---------|
| 1 | ... | As a ... I want ... | T-001, T-002 |

## Ticket List

### T-001: [TAG] Title
**Epic:** Epic Title
**Type:** backend | frontend
**Depends on:** none | T-XXX

[Full ticket description as it will appear in Linear]

---

### T-002: [TAG] Title
...
```

## Phase 4 — Iterate with User (skip if `--force`)

**If `--force` is set:** Skip this phase entirely. Go directly to Phase 5.

**Otherwise,** after writing the plan, display a summary:

> Here's the ticket plan for **[Milestone Title]**:
>
> **N tickets** across **M epics**
>
> | # | Epic | Tickets |
> |---|------|---------|
> | 1 | ... | T-001, T-002 |
>
> Full plan written to `milestones/<milestone-name>/tickets/PLAN.md`.
>
> Would you like to:
> 1. **Proceed** — create all tickets in Linear
> 2. **Edit** — suggest changes to the plan before creating
> 3. **Select** — pick specific tickets to create (skip others)

If the user chooses **Edit**, loop — apply their changes, re-write the plan, and ask again.

If the user chooses **Select**, ask which ticket IDs to create and which to skip.

## Phase 5 — Create Tickets in Linear

### Prerequisites

A Linear API key must be available. Check for:
1. Environment variable `LINEAR_API_KEY`
2. A `.env` file in the project root with `LINEAR_API_KEY=...`

If no key is found, tell the user:

> I need a Linear API key to create tickets. Set `LINEAR_API_KEY` in your environment or `.env` file.
> You can create one at https://linear.app/settings/api

### Linear Team and State

**If `--force` is set:** Resolve the team automatically. Use the `linear_list_teams` tool to find the team. If there's only one team, use it. If there are multiple, pick the one most relevant to the project (e.g., matching the repo name). If ambiguous, ask the user once — but do not enter full iteration mode.

**Otherwise,** before creating, ask the user for:
- **Team key** or ID (e.g., the short key visible in Linear URLs like `RES`)
- If not provided, infer from the project context or ask.

### Creating Tickets

For each ticket (in dependency order), use the Linear GraphQL API.

**Endpoint:** `https://api.linear.app/graphql`
**Headers:** `Authorization: <LINEAR_API_KEY>`, `Content-Type: application/json`

#### Step 1: Resolve team ID

```graphql
query {
  teams {
    nodes {
      id
      name
      key
    }
  }
}
```

#### Step 2: Create each epic first

```graphql
mutation {
  issueCreate(input: {
    teamId: "<team-id>",
    title: "Epic: <epic-title>",
    description: "<epic-description>"
  }) {
    issue {
      id
      identifier
    }
    success
  }
}
```

Record the returned `identifier` for each epic.

#### Step 3: Create tickets under their epics

For each ticket:

```graphql
mutation {
  issueCreate(input: {
    teamId: "<team-id>",
    title: "[TAG] <ticket-title>",
    description: "<ticket-description-with-ref-line>",
    parentId: "<epic-id>"
  }) {
    issue {
      id
      identifier
    }
    success
  }
}
```

**Important:** After creating all tickets, update every ticket's `ref:` line in Linear with the actual Linear identifiers (`RES-1`, `RES-2`, etc.) instead of the plan identifiers (`T-001`, `T-002`). This requires updating each ticket description after all tickets are created.

### Tracking Created Tickets

After creation, write a mapping file to `milestones/<milestone-name>/tickets/CREATED.md`:

```markdown
# Created Linear Tickets — [Milestone Title]

**Date:** YYYY-MM-DD HH:MM:SS UTC

## Mapping

| Plan ID | Linear ID | Title | URL |
|---------|-----------|-------|-----|
| T-001 | RES-1 | [TAG] ... | https://linear.app/... |

## Created Epics

| Plan Epic | Linear ID | Title | URL |
|-----------|-----------|-------|-----|
| Epic 1 | RES-2 | Epic: ... | https://linear.app/... |
```

Report the final summary:

> **Done!** Created **N tickets** and **M epics** in Linear.
>
> Mapping written to `milestones/<milestone-name>/tickets/CREATED.md`.

## Key Rules

- **Read the spec thoroughly** before generating any tickets. Every ticket must be traceable to an acceptance criterion.
- **Tickets must be self-contained.** All context goes in the ticket — no "see spec for details."
- **One ticket = one implementation unit.** Do not combine a backend module and a frontend page into one ticket.
- **ref: lines are mandatory.** They encode the dependency graph. Get them right.
- **Linear description format:** The `ref:` line must be the first line, followed by a blank line, then the markdown content.
- **Confirm before creating.** Never push to Linear without user approval.
- **Epic = user flow. Ticket = implementation unit (backend feature OR frontend page).**
