# Created Linear Tickets — Resume Builder

**Date:** 2026-08-01
**Team:** RES (Resume-builder-v3)

## Epics

| Plan ID | Linear ID | Title | URL |
|---------|-----------|-------|-----|
| Epic 1 | RES-6 | Epic: Authenticate and manage account | https://linear.app/issue/RES-6 |
| Epic 2 | RES-7 | Epic: Create and edit resume content | https://linear.app/issue/RES-7 |
| Epic 3 | RES-8 | Epic: View live preview and export PDF | https://linear.app/issue/RES-8 |
| Epic 4 | RES-9 | Epic: Tailor resume to a job description | https://linear.app/issue/RES-9 |

## Tickets

| Plan ID | Linear ID | Tag | Title | Epic | Dependencies | URL |
|---------|-----------|-----|-------|------|-------------|-----|
| T-001 | RES-11 | [DB] | Create Prisma schema and run initial migration | RES-6 | none | https://linear.app/issue/RES-11 |
| T-002 | RES-12 | [INFRA] | Set up NestJS config, database, and logger modules | RES-6 | RES-11 | https://linear.app/issue/RES-12 |
| T-003 | RES-10 | [CRYPTO] | Implement CryptoService for per-field PII encryption | RES-6 | RES-12 | https://linear.app/issue/RES-10 |
| T-004 | RES-13 | [AUTH] | Implement signup, login, logout, and session endpoints | RES-6 | RES-12 | https://linear.app/issue/RES-13 |
| T-005 | RES-14 | [AUTH] | Create login and signup pages with anonymous-to-authenticated transition | RES-6 | RES-13 | https://linear.app/issue/RES-14 |
| T-006 | RES-17 | [RES] | Implement resume CRUD endpoints with encrypted field storage | RES-7 | RES-10, RES-13 | https://linear.app/issue/RES-17 |
| T-007 | RES-16 | [BUILD] | Create ResumeBuilder page shell with layout picker and section toggling | RES-7 | RES-14, RES-17 | https://linear.app/issue/RES-16 |
| T-008 | RES-15 | [BUILD] | Implement section editors for all 10 section types | RES-7 | RES-16 | https://linear.app/issue/RES-15 |
| T-009 | RES-20 | [PREVIEW] | Create live preview pane rendering the selected layout | RES-8 | RES-16 | https://linear.app/issue/RES-20 |
| T-010 | RES-19 | [PDF] | Implement client-side PDF export via jsPDF and html2canvas | RES-8 | RES-20 | https://linear.app/issue/RES-19 |
| T-011 | RES-21 | [TAILOR] | Implement JD tailoring endpoint with configurable matching engine | RES-9 | RES-17 | https://linear.app/issue/RES-21 |
| T-012 | RES-18 | [TAILOR] | Create JD input component with tailoring integration | RES-9 | RES-15, RES-21 | https://linear.app/issue/RES-18 |
