# Changelog

All notable changes to the **Resume Builder** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Production Dockerfiles for backend and frontend (`backend/Dockerfile`,
  `frontend/Dockerfile`) — inject `FRONTEND_URL`, `DATABASE_URL`, and the
  encryption keys via environment variables at runtime; CORS is derived
  from the injected frontend origin.
- Environment file reorganization — infra config lives in the root `.env`,
  app-specific config in `backend/.env` / `frontend/.env`, container env
  via `.env.docker` (`env_file` in docker-compose).
- `README.md` — renamed to **Resume Builder**, added an "AI Harness"
  section describing the agentic development flow.

## [0.9.0] — 2026-08-06

### Added
- **Volunteer section** in the builder (editor, preview layouts, Tailor
  support, catalog seed) — RES-113.
- **Pencil edit icon** on dashboard resume cards — RES-114.
- **Zoom in/out** floating controls on the builder live preview — RES-115.
- **Eye (visibility) toggle on sub-items** — eye shows/crossed hides each
  item; lock protects it from Tailor. Bullet-level toggles for
  Experience/Projects — RES-106.
- **Deferred resume creation** — "Create New Resume" opens `/builder`
  with no DB row until the first edit; the uuid is claimed on autosave —
  RES-103.
- **Per-resume data isolation** — each resume loads only its own data by
  id; anonymous storage is keyed per resume — RES-102.
- **Autosave as sole persistence** — the "Unsaved Changes" modal is
  disabled; every edit autosaves — RES-105.
- **Tailor only toggles sub-items** — never whole sections; locked items
  are untouched — RES-108.
- **Hidden sections keep their position** — no jump to the bottom — RES-109.
- **Tailor Resume button removed from the toolbar** — available only in
  the Job Description modal — RES-107.
- **"Edit in Builder"** dashboard action + double-click hint — RES-100/104.
- **Dashboard zoom controls** on the resume preview.
- **Mobile dashboard ergonomics** — preview on top, resume list below;
  double-tap opens the builder; taller layout picker.
- **PDF export fixed** for Tailwind v4 `oklch` colors (html2canvas-pro) —
  RES-111.
- **Volunteer + entry-level lock e2e coverage** — RES-97/98.

### Fixed
- Renaming a resume no longer wipes experience bullet points — RES-112.
- Builder no longer loads the first resume for every id (per-resume data) —
  RES-102.
- Fresh DB migration chain (add_users_and_sessions duplication) — RES-94.
- Backend branch coverage restored above the 90% threshold — RES-96.
- e2e spec selector/strict-mode failures — RES-95.
- Authenticated save/load API contract (upsert route, DTO reconciliation,
  list-shape loader) — RES-93.

### Infrastructure
- Atlas: `mergeToBranch` aborts conflicted merges instead of leaving
  orphaned `MERGE_HEAD` blocking all pushes — RES-110.
- Atlas: done tickets with pruned worktrees no longer reset to pending on
  restart (re-assignment loop).
- Atlas: boss liveness false-positives fixed (PID boot-skew + busy-boss
  receipt timeout).
- Atlas: worktree backend deps auto-installed via `pre.sh`; safe DB
  migrations instead of `db push` / snapshot copies.
- Atlas: requeue-race guard — killed-after-merge workers complete as done
  instead of spawning redundant re-verification.
- Docker: container boots with `prisma migrate deploy` (additive) instead
  of `db push` (schema reset).
- Canonical dev DB path consolidated to `backend/prisma/db/dev.db`
  (bind-mounted; no named-volume shadowing).

## [0.8.0] — 2026-08-05

### Added
- **Lock toggle on sub-items** (soft skills, projects, experience) —
  moved from section level — RES-97.
- **One-step Tailor Resume UX** — JD modal button, animation, eye-toggle
  feedback — RES-98.
- **Tailor engine** with `keyword` / `llm` / `hybrid` matching, bullet cap,
  and lock-aware filtering.
- **Two-pane dashboard** — resume list + live preview — RES-87.
- **Duplicate resume** endpoint — RES-84.
- **Inline rename** on dashboard cards — RES-60.

### Fixed
- Dashboard cards black in dark mode.
- Fullscreen preview button UI — RES-65.
- Builder main-column double scrollbar.
- Worker pane inflation after deaths (Atlas).

## [0.7.0] — 2026-08-04

### Added
- **Resume builder shell** — layout picker, section toggles, live preview.
- **Experience / Education sections** with entry + bullet editing.
- **Name/rename resume** in the builder.
- **PDF export** of the live preview (jsPDF + html2canvas).
- **Tailwind + shadcn-vue** restyle of the builder and auth views.

## [0.6.0] — 2026-08-02

### Added
- **Authentication** — signup, login, logout, session endpoints, and
  anonymous-to-authenticated migration — RES-11/13/14.
- **Account view** and account management.
- **Dashboard page** — list resumes, create new, preview.

## [0.1.0] — 2026-08-01

### Added
- Initial project scaffold (NestJS backend, Vue 3 frontend).
- Prisma schema + initial migration.

---

## How this changelog is maintained

This project is built by an [agentic harness](./README.md#ai-harness);
changelog entries are grouped by user-visible feature area and mapped to
the Linear tickets (`RES-<n>`) that produced them.
