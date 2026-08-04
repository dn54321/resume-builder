# Created Linear Tickets — Dashboard & Builder UX Overhaul

**Date:** 2026-08-04 13:39:07 UTC

## Mapping

| Plan ID | Linear ID | Title | URL |
|---------|-----------|-------|-----|
| T-001 | RES-80 | [HOME] Fix "Create New Resume" on homepage to navigate directly to builder | https://linear.app/resume-builder-v3/issue/RES-80 |
| T-002 | RES-82 | [NAV] Add route transition animation between pages | https://linear.app/resume-builder-v3/issue/RES-82 |
| T-003 | RES-89 | [DASH] Replace inline title edit with dropdown menu on resume cards | https://linear.app/resume-builder-v3/issue/RES-89 |
| T-004 | RES-84 | [RES] Add duplicate resume endpoint | https://linear.app/resume-builder-v3/issue/RES-84 |
| T-005 | RES-87 | [DASH] Redesign dashboard as two-pane layout with resume list and live preview | https://linear.app/resume-builder-v3/issue/RES-87 |
| T-006 | RES-90 | [BUILD] Remove manual save button and add autosave visual indicator | https://linear.app/resume-builder-v3/issue/RES-90 |
| T-007 | RES-85 | [DB] Add locked column to ResumeSection schema | https://linear.app/resume-builder-v3/issue/RES-85 |
| T-008 | RES-91 | [SEC] Add eye and lock toggles to section sidebar and editor | https://linear.app/resume-builder-v3/issue/RES-91 |
| T-009 | RES-92 | [TAILOR] Skip locked sections during Tailor Resume keyword matching | https://linear.app/resume-builder-v3/issue/RES-92 |
| T-010 | RES-88 | [NAV] Replace email with profile icon in navbar | https://linear.app/resume-builder-v3/issue/RES-88 |
| T-011 | RES-86 | [PREVIEW] Remove fullscreen preview on desktop and hide 2:1 column layout behind feature flag | https://linear.app/resume-builder-v3/issue/RES-86 |
| T-012 | RES-81 | [MOBILE] Add floating action button for fullscreen preview and fix mobile builder layout | https://linear.app/resume-builder-v3/issue/RES-81 |
| T-013 | RES-83 | [E2E] Dashboard and builder core flow e2e tests | https://linear.app/resume-builder-v3/issue/RES-83 |

## Created Epics

| Plan Epic | Linear ID | Title | URL |
|-----------|-----------|-------|-----|
| Epic 1 | RES-75 | Epic: Create resumes seamlessly | https://linear.app/resume-builder-v3/issue/RES-75 |
| Epic 2 | RES-74 | Epic: Browse and manage resumes in dashboard | https://linear.app/resume-builder-v3/issue/RES-74 |
| Epic 3 | RES-78 | Epic: Edit resumes with autosave | https://linear.app/resume-builder-v3/issue/RES-78 |
| Epic 4 | RES-77 | Epic: Control section visibility and Tailor behavior | https://linear.app/resume-builder-v3/issue/RES-77 |
| Epic 5 | RES-79 | Epic: Polish UI across the app | https://linear.app/resume-builder-v3/issue/RES-79 |
| Epic 6 | RES-76 | Epic: Verify everything works end-to-end | https://linear.app/resume-builder-v3/issue/RES-76 |

## Dependency Graph

```
RES-80 (homepage fix) ─────────────────────────────────────┐
RES-82 (route transition) ─────────────────────────────────┤
RES-89 (dropdown menu) ──┬── RES-87 (two-pane dashboard) ──┤
RES-84 (duplicate endpoint)┘                                │
RES-90 (autosave) ─────────────────────────────────────────┤
RES-85 (DB locked) ──┬── RES-91 (eye/lock toggles) ──┐     │
                     └── RES-92 (tailor locked) ──────┤     │
RES-88 (profile icon) ─────────────────────────────────────┤
RES-86 (preview/feature-flag) ──┬── RES-81 (mobile FAB) ───┤
                                └───────────────────────────┤
                                            RES-83 (E2E) ◄─┘
```
