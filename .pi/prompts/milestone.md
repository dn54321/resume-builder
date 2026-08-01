---
description: Define a product milestone. Prompts for goals, writes a structured spec to milestones/YYYY-MM-DD-HHMMSS-TITLE/, then iterates with user feedback.
argument-hint: "[short title]"
---

You are helping the user define a product milestone for **resume-v3**, a resume-building application with a NestJS backend and Vue/Vite frontend.

## Phase 1 — Gather Requirements

If the user already described a milestone in their message ($@), use that. Otherwise, ask them:

> What milestone would you like to implement? Describe the feature or goal — what should the user be able to do when it's done?

Also ask clarifying questions to nail down:
- **Scope**: What exactly is in/out of scope?
- **User story**: As a ___, I want ___ so that ___.
- **Acceptance criteria**: How do we know it's done?
- **Technical constraints**: Any specific tech choices, performance requirements, or limitations?
- **Dependencies**: Does this milestone depend on anything else?

## Phase 2 — Write the Spec

Create a directory `milestones/YYYY-MM-DD-HHMMSS-TITLE/` (using today's date, current time in UTC, and a kebab-case slug of the title) and write a `SPEC.md` inside it with these sections:

```markdown
# Milestone: [Title]

**Date:** YYYY-MM-DD HH:MM:SS UTC
**Status:** Draft

## Summary
One-paragraph overview of what this milestone delivers.

## User Stories
- As a [role], I want [goal] so that [reason].

## Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

## Scope
### In Scope
- Item

### Out of Scope
- Item

## Technical Approach
- High-level architecture decisions
- API endpoints (method + path + brief description)
- Database schema changes (new tables/columns)
- Frontend routes/components affected

## Dependencies
- What this milestone depends on (other milestones, infrastructure, third-party services)

## Open Questions
- Unresolved decisions or unknowns
```

## Phase 3 — Iterate

After writing the spec, show a summary and ask:

> Here's the spec for **[Title]**. Is there anything missing or that needs changing?

Loop — edit the spec file and re-ask until the user says they're happy. When they confirm, update the status to **Approved** and tell them the spec is ready.

## Key Rules

- Write specs to `/home/dn54321/projects/resume-v3/milestones/YYYY-MM-DD-HHMMSS-TITLE/SPEC.md`
- Use kebab-case for the TITLE slug
- Read the project AGENTS.md files (`.pi/AGENTS.md` in both `backend/` and root) to stay aligned with conventions
- Keep specs concise but complete — don't add fluff
- Don't invent requirements the user didn't ask for; ask if unsure
