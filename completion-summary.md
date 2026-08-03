## RES-31: Build welcome/landing page at /

### Changes Made

**`frontend/src/views/HomeView.vue`** — Full rewrite
- Replaced the elaborate illustrated landing page with a clean, simple design
- Hero section with "Resume Builder" badge, headline "Build a resume that gets you hired", subheading explaining the value proposition
- **Auth-aware CTAs:**
  - Guest state: "Get Started" → `/signup`, "Log in" → `/login`
  - Authenticated state: "Go to Dashboard" → `/dashboard`, "Create New Resume" → `/dashboard`
- Feature grid with 4 cards (emoji icons): Live Preview, Smart Sections, Tailor to Jobs, PDF Export
- Simple centered footer: "Resume Builder — Built with Vue, NestJS, and Tailwind CSS"
- Responsive grid: stacks 2 columns on `sm`, 4 columns on `lg`

**`frontend/src/views/__tests__/HomeView.spec.ts`** — Full rewrite (16 tests)
- Hero section: badge, headline, subheading rendering
- Guest CTAs: Get Started links to /signup, Log in links to /login, no dashboard CTAs
- Authenticated CTAs: Go to Dashboard and Create New Resume link to /dashboard, no guest CTAs
- Feature cards: exactly 4 cards, all titles and descriptions render, icons present
- Footer: present with correct text
- Verified with Pinia auth store setup for both guest and authenticated states

**`frontend/vitest.config.ts`** — Removed `HomeView.vue` from coverage exclude list (no longer Vue boilerplate)

**`frontend/e2e/vue.spec.ts`** — Updated e2e tests
- Checks new h1 headline
- Checks 4 feature cards render
- Checks guest CTAs scoped to hero section (avoids nav bar collision)
- Checks footer renders

### Verification
- All 420 unit tests pass (35 test files)
- Type-check passes (`vue-tsc --build`)
- Lint passes (only pre-existing JSDoc warnings)
- Coverage thresholds met: 94.3% statements, 92.35% branches, 95.55% functions, 94.2% lines
- 4/4 e2e tests pass (chromium)
