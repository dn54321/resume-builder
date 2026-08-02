# Created Linear Tickets — UI/UX Polish: Theming, Layout & Usability

**Date:** 2026-08-02 11:00:24 UTC

## Mapping

| Plan ID | Linear ID | Title | URL |
|---------|-----------|-------|-----|
| T-001 | RES-44 | [THEME] Define color palette and theme infrastructure | https://linear.app/resume-builder-v3/issue/RES-44 |
| T-002 | RES-47 | [THEME] Apply theme to builder and add theme toggle | https://linear.app/resume-builder-v3/issue/RES-47 |
| T-003 | RES-48 | [BUILD] Fix section toggle data persistence | https://linear.app/resume-builder-v3/issue/RES-48 |
| T-004 | RES-45 | [BUILD] Replace section editor with all-sections stacked view | https://linear.app/resume-builder-v3/issue/RES-45 |
| T-005 | RES-46 | [BUILD] Fix section reorder in sidebar with HTML5 drag-and-drop | https://linear.app/resume-builder-v3/issue/RES-46 |
| T-006 | RES-49 | [PREVIEW] Add full-screen resume preview modal | https://linear.app/resume-builder-v3/issue/RES-49 |
| T-007 | RES-51 | [BUILD] Move job description to modal and add toolbar | https://linear.app/resume-builder-v3/issue/RES-51 |
| T-008 | RES-50 | [AUTH] Add client-side email validation to signup and login | https://linear.app/resume-builder-v3/issue/RES-50 |
| T-009 | RES-52 | [LAND] Add custom SVG illustrations and graphics to landing page | https://linear.app/resume-builder-v3/issue/RES-52 |

## Created Epics

| Plan Epic | Linear ID | Title | URL |
|-----------|-----------|-------|-----|
| Epic 1 | RES-42 | Epic: Apply warm creative theme with light/dark/system toggle | https://linear.app/resume-builder-v3/issue/RES-42 |
| Epic 2 | RES-40 | Epic: Improve editor layout and section management | https://linear.app/resume-builder-v3/issue/RES-40 |
| Epic 3 | RES-43 | Epic: Enhance preview and job description UX | https://linear.app/resume-builder-v3/issue/RES-43 |
| Epic 4 | RES-41 | Epic: Fix email validation on signup and login | https://linear.app/resume-builder-v3/issue/RES-41 |

## Dependency Graph

```
RES-44 (theme infra)      RES-48 (toggle persist)
    ↓                          ↓
RES-47 (apply theme)      RES-45 (all-sections) ← depends on RES-48
    ↓                      RES-46 (section reorder) ← depends on RES-48
RES-51 (JD modal)        
                           
RES-52 (SVG illustrations) ← depends on RES-44

RES-49 (fullscreen preview) — independent
                           RES-50 (email validation) — independent
```
