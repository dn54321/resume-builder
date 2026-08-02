# Ticket Plan — UI Overhaul: Tailwind + Component Library + Full Working Pages

**Milestone:** milestones/2026-08-02-004505-ui-overhaul/SPEC.md
**Date:** 2026-08-02 00:45:05 UTC
**Total Tickets:** 12

## Epics

| # | Epic Title | User Story | Tickets |
|---|------------|------------|---------|
| 1 | Onboard visitors with a polished landing and auth experience | As a visitor, I want a welcoming landing page and polished login/signup forms so that the app feels professional and I know what I'm signing up for. | T-001, T-004, T-005, T-006 |
| 2 | Navigate the app and manage my account from any page | As an authenticated user, I want navigation that shows me the builder, my account, and logout from every page, and I want a proper 404 when things go wrong. | T-002, T-003, T-007, T-010 |
| 3 | Manage my resumes from a dashboard | As an authenticated user, I want a dashboard listing my resumes so that I can create, open, and manage multiple resumes. | T-008 |
| 4 | Use the resume builder with a polished UI | As a user, I want the resume builder to look polished and consistent with the rest of the app. | T-009 |
| 5 | Fix bugs preventing core app functionality | As a user, I want signup/login to actually work, data entry to be discoverable, and section toggling to not jump items around. | T-011, T-012 |

## Ticket List

---

### T-001: [INFRA] Install Tailwind CSS, shadcn-vue, and remove Vue boilerplate

**Epic:** Onboard visitors with a polished landing and auth experience
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Bootstrap the new design system by installing Tailwind CSS v4 and shadcn-vue, configuring the build pipeline, and removing all Vue scaffold boilerplate (HelloWorld, TheWelcome, WelcomeItem, icon components, Vue logo, base.css, about page). This is the foundational ticket — every other ticket depends on the output.

## What to Build

### 1. Install dependencies
```bash
cd frontend && npm install -D tailwindcss @tailwindcss/vite
```

### 2. Configure Vite
Edit `frontend/vite.config.ts` to add the Tailwind Vite plugin:
```ts
import tailwindcss from '@tailwindcss/vite'
// Add tailwindcss() to the plugins array
```

### 3. Set up main.css
Replace `frontend/src/assets/main.css` with a single Tailwind import:
```css
@import "tailwindcss";
```

### 4. Remove Vue boilerplate files
Delete these files:
- `frontend/src/components/HelloWorld.vue`
- `frontend/src/components/TheWelcome.vue`
- `frontend/src/components/WelcomeItem.vue`
- `frontend/src/components/icons/IconCommunity.vue`
- `frontend/src/components/icons/IconDocumentation.vue`
- `frontend/src/components/icons/IconEcosystem.vue`
- `frontend/src/components/icons/IconSupport.vue`
- `frontend/src/components/icons/IconTooling.vue`
- `frontend/src/assets/logo.svg`
- `frontend/src/assets/base.css`
- `frontend/src/views/AboutView.vue`

### 5. Set up shadcn-vue
- Run `npx shadcn-vue@latest init` in `frontend/`
- Configure with: TypeScript yes, Tailwind CSS 4, base color Slate, CSS variables yes
- This creates `frontend/components.json` and `frontend/src/components/ui/` directory

### 6. Install shadcn-vue components
Run these commands to install the components we need:
```bash
npx shadcn-vue@latest add button
npx shadcn-vue@latest add input
npx shadcn-vue@latest add card
npx shadcn-vue@latest add label
npx shadcn-vue@latest add dropdown-menu
npx shadcn-vue@latest add separator
npx shadcn-vue@latest add badge
npx shadcn-vue@latest add skeleton
npx shadcn-vue@latest add alert
```

### 7. Update main.ts
Update `frontend/src/main.ts` to import the new `main.css` path (should already be importing `./assets/main.css`, which now contains `@import "tailwindcss"` — confirm this works).

## Acceptance Criteria
- [ ] `npm run dev` starts without errors and Tailwind classes work in templates
- [ ] All 11 boilerplate files are deleted
- [ ] `components.json` exists at `frontend/components.json`
- [ ] `frontend/src/components/ui/` contains button, input, card, label, dropdown-menu, separator, badge, skeleton, and alert components
- [ ] Existing tests still pass (routes, auth, builder — they import components being deleted, so update them)
- [ ] shadcn-vue's `cn()` utility and Tailwind class merging works

## Technical Notes
- Tailwind v4 uses `@import "tailwindcss"` instead of the v3 `@tailwind base/components/utilities` directives
- shadcn-vue components are copy-pasted source files — they live in your repo at `src/components/ui/`
- The `cn()` utility at `src/lib/utils.ts` (created by shadcn-vue init) handles class merging with `clsx` and `tailwind-merge`
- When deleting HelloWorld.vue etc., update any test files that import them (e.g., `__tests__/` directories). The deleted files had minimal test coverage.
- The `AboutView.vue` removal means the `/about` route in `router/index.ts` needs updating, but do that in T-003

---

### T-002: [SHELL] Build new App.vue shell with responsive navbar

**Epic:** Navigate the app and manage my account from any page
**Type:** frontend
**Depends on:** T-001

ref: T-001

## Summary
Rewrite `App.vue` to replace the Vue boilerplate shell with a clean, responsive navbar using shadcn-vue components. The navbar shows the app brand, nav links, and auth-aware controls (login/signup for guests, user dropdown with account/logout for authenticated users). The `<RouterView />` renders the active page below the navbar.

## What to Build

### 1. `frontend/src/App.vue` — full rewrite

Replace the entire file. The new structure:

```vue
<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { useAuth } from '@/features/auth/composables/useAuth'
// Import shadcn-vue components: Button, DropdownMenu (DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator)

const router = useRouter()
const { isAuthenticated, user, checkSession, logout } = useAuth()

onMounted(() => {
  checkSession()
})

async function handleLogout() {
  await logout()
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <!-- Navbar -->
    <header class="border-b bg-white sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <!-- Brand -->
        <RouterLink to="/" class="flex items-center gap-2 font-bold text-xl text-slate-900 no-underline">
          <svg><!-- simple document icon, 24x24 --></svg>
          Resume Builder
        </RouterLink>

        <!-- Nav links -->
        <nav class="flex items-center gap-4">
          <RouterLink to="/" class="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
            Home
          </RouterLink>

          <template v-if="isAuthenticated">
            <RouterLink to="/dashboard" class="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              My Resumes
            </RouterLink>

            <!-- User dropdown -->
            <DropdownMenu>
              <DropdownMenuTrigger as-child>
                <Button variant="ghost" size="sm" class="gap-2">
                  <span class="text-sm max-w-[160px] truncate">{{ user?.email }}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" class="w-56">
                <DropdownMenuItem @click="router.push('/account')">
                  Account settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem @click="handleLogout">
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </template>

          <template v-else>
            <RouterLink to="/login">
              <Button variant="ghost" size="sm">Log in</Button>
            </RouterLink>
            <RouterLink to="/signup">
              <Button size="sm">Sign up</Button>
            </RouterLink>
          </template>
        </nav>
      </div>
    </header>

    <!-- Page content -->
    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
```

### Brand icon
Create `frontend/src/components/AppLogo.vue` with a simple inline SVG (a document icon with a subtle "R" or checkmark). 24x24, uses `currentColor`.

## Acceptance Criteria
- [ ] Navbar renders on every page with "Resume Builder" brand + logo
- [ ] Guest state: shows "Log in" (ghost button) and "Sign up" (primary button)
- [ ] Authenticated state: shows "My Resumes" link, user email as dropdown trigger
- [ ] User dropdown: "Account settings" navigates to `/account`, "Log out" calls logout + redirects to `/`
- [ ] Navbar is sticky at top, has bottom border
- [ ] `<RouterView />` renders the active page below the navbar
- [ ] Existing tests for App.vue updated or rewritten for new template
- [ ] Responsive: on narrow screens, nav links don't overflow (at minimum, the layout doesn't break — full mobile menu can be a follow-up)

## Technical Notes
- Use `Button` from `@/components/ui/button` with variants `ghost`, `default` (for primary "Sign up")
- Use `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem`, `DropdownMenuSeparator` from shadcn-vue
- The logo SVG should be simple enough to inline — no external SVG file needed unless it becomes complex
- Keep the `checkSession()` call on mount so auth state is available immediately
- Tests: mock `useAuth` composable, verify conditional rendering of guest vs authenticated nav items

---

### T-003: [SHELL] Update router, index.html metadata, and create favicon

**Epic:** Navigate the app and manage my account from any page
**Type:** frontend
**Depends on:** T-001, T-002

ref: T-001 T-002

## Summary
Update the Vue Router configuration to add new routes (`/dashboard`, `/builder/:id`, 404 catch-all), remove the `/about` route, update `index.html` with the correct title and favicon, and create a simple SVG favicon file.

## What to Build

### 1. `frontend/src/router/index.ts` — update routes

New routes to add:
```ts
{
  path: '/dashboard',
  name: 'dashboard',
  component: () => import('../views/DashboardView.vue'),
  meta: { requiresAuth: true },
},
{
  path: '/builder/:id',
  name: 'builder-edit',
  component: () => import('../features/builder/ResumeBuilder.vue'),
  meta: { requiresAuth: true },
},
{
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: () => import('../views/NotFoundView.vue'),
},
```

Routes to remove:
- `/about` route (the `AboutView.vue` file was deleted in T-001)

### 2. Add navigation guard for auth-required routes

Add an `router.beforeEach` guard that checks `requiresAuth` meta field. If true and user is not authenticated, redirect to `/login` with a `redirect` query param.

### 3. `frontend/index.html` — update metadata

- Change `<title>` from "Vite App" to "Resume Builder"
- Add `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`

### 4. `frontend/public/favicon.svg` — create favicon

Create a simple 32x32 SVG favicon: a rounded square background (slate-900) with a white document icon and a small checkmark or "R". Keep it under 1KB.

### 5. Remove AboutView reference from tests

Any test that imports `AboutView` needs updating (the file was removed in T-001).

## Acceptance Criteria
- [ ] `/dashboard` route resolves and shows DashboardView (component can be a stub that T-008 fills in)
- [ ] `/builder/:id` route resolves with the ID accessible via `useRoute().params.id`
- [ ] `/about` route returns 404 (caught by catch-all)
- [ ] Any unknown URL (e.g., `/foo/bar`) shows the NotFoundView
- [ ] Auth guard redirects unauthenticated users from `/dashboard` to `/login?redirect=/dashboard`
- [ ] Auth guard redirects unauthenticated users from `/builder/:id` to `/login?redirect=/builder/:id`
- [ ] `index.html` `<title>` is "Resume Builder"
- [ ] `favicon.svg` exists at `frontend/public/favicon.svg` and is valid SVG
- [ ] Existing tests for the router pass

## Technical Notes
- The auth guard should use the auth store directly (`useAuthStore()`) since it runs outside a component
- The `redirect` query param should be used by LoginView after successful login to send the user where they intended to go
- Do NOT implement the meta guard redirect logic in LoginView in this ticket — that's T-005's responsibility (but leave a `// TODO` or handle it there)
- Create DashboardView and NotFoundView as minimal stub components if they don't exist yet (they get real content in T-008 and T-010)

---

### T-004: [LAND] Build welcome/landing page at /

**Epic:** Onboard visitors with a polished landing and auth experience
**Type:** frontend
**Depends on:** T-001, T-002

ref: T-001 T-002

## Summary
Replace the Vue boilerplate HomeView with a clean, simple landing page that explains what the app does and drives visitors to sign up or log in. This is the first thing visitors see — it should convey the value proposition quickly and provide clear calls to action.

## What to Build

### `frontend/src/views/HomeView.vue` — full rewrite

Structure:

```
Hero section (centered, max-w-3xl)
├── Badge: "Resume Builder" or tagline
├── Heading: "Build a resume that gets you hired" (or similar punchy headline)
├── Subheading: Brief explanation — "Create professional resumes with smart section management, live preview, and PDF export. Tailor your resume to any job description."
└── CTA buttons:
    ├── "Get Started" (primary, links to /signup)
    └── "Log in" (outline/ghost, links to /login)

Features grid (3-4 cards, max-w-5xl)
├── Card: "Live Preview" — See changes in real time as you edit
├── Card: "Smart Sections" — Toggle and reorder sections to match the job
├── Card: "Tailor to Jobs" — Paste a job description, highlight relevant bullets
└── Card: "PDF Export" — Download a polished PDF with one click

Footer (simple, centered)
└── Text: "Resume Builder — Built with Vue, NestJS, and Tailwind CSS"
```

### Behavior

- If user is already authenticated, the hero CTAs change: "Go to Dashboard" (primary) and a secondary "Create New Resume" linking to `/dashboard`
- Each feature card has an icon (use simple inline SVG or emoji), a title, and a one-line description
- No heavy animations — keep it fast and clean

## Acceptance Criteria
- [ ] Page renders at `/` with no Vue boilerplate visible
- [ ] Hero section has headline, subheading, and two CTA buttons
- [ ] Authenticated state: CTAs show "Go to Dashboard" and "Create New Resume"
- [ ] Guest state: CTAs show "Get Started" (→ signup) and "Log in"
- [ ] Feature grid shows exactly 4 feature cards with icons, titles, descriptions
- [ ] Footer is present with app name
- [ ] Page is responsive — stacks vertically on narrow screens
- [ ] Tests: verify conditional CTA rendering for auth/guest states, verify feature cards render

## Technical Notes
- Use `Card`, `CardHeader`, `CardTitle`, `CardContent` from shadcn-vue for feature cards
- Use `Button` with variants for CTAs
- Use `Badge` for the tagline above the hero heading
- Only use Tailwind classes — no scoped CSS needed
- The layout should use `max-w-*` containers with auto margins for centering
- Keep the tone professional but friendly — no marketing fluff

---

### T-005: [AUTH] Restyle LoginView with Tailwind + shadcn-vue

**Epic:** Onboard visitors with a polished landing and auth experience
**Type:** frontend
**Depends on:** T-001

ref: T-001

## Summary
Restyle the existing LoginView to use Tailwind CSS and shadcn-vue components (Card, Input, Label, Button, Alert). All existing logic (validation, error handling, API calls, redirect on success) stays identical — only the template and styles change.

## What to Build

### `frontend/src/features/auth/LoginView.vue` — restyle

Replace the scoped `<style>` block with Tailwind classes. Use shadcn-vue components:

- **Card** wrapper: centers the form vertically and horizontally, adds shadow and border
- **CardHeader + CardTitle**: "Log in" heading
- **Input** components: email and password fields with `Label`
- **Alert** (destructive variant): displays validation/API errors instead of the current `<div class="errors">`
- **Button**: submit button with loading state (`:disabled="submitting"`)
- Bottom link: "Don't have an account? Sign up" linking to `/signup`

### Auth guard redirect

After successful login, if `route.query.redirect` exists, navigate there. Otherwise redirect to `/dashboard` (changed from current `/builder`).

## Acceptance Criteria
- [ ] Form is centered in a Card component with shadow and border
- [ ] Email and password fields use shadcn-vue `Input` + `Label`
- [ ] Validation errors display in an Alert component with destructive variant
- [ ] Submit button shows "Logging in..." when `submitting` is true
- [ ] "Don't have an account?" link navigates to `/signup`
- [ ] All existing login functionality works (validation, error parsing from ApiRequestError, redirect)
- [ ] After login, redirects to `query.redirect` if present, otherwise `/dashboard`
- [ ] If already authenticated on mount, redirects to `/dashboard`
- [ ] Existing LoginView tests are updated to match new markup and still pass
- [ ] No scoped `<style>` block — all styling via Tailwind classes

## Technical Notes
- The component already uses `useAuth().login()` and `ApiRequestError` — don't change this
- Field-level vs. general errors from `ApiRequestError` must both display correctly
- Use `useRoute().query.redirect` for the post-login redirect
- The Card should have `max-w-md` and be vertically centered: `min-h-[60vh] flex items-center justify-center`

---

### T-006: [AUTH] Restyle SignupView with Tailwind + shadcn-vue

**Epic:** Onboard visitors with a polished landing and auth experience
**Type:** frontend
**Depends on:** T-001

ref: T-001

## Summary
Restyle the existing SignupView to use Tailwind CSS and shadcn-vue components. Identical approach to T-005 (LoginView restyle) — same Card layout, Input components, Alert for errors, Button with loading state. All existing logic stays unchanged.

## What to Build

### `frontend/src/features/auth/SignupView.vue` — restyle

Same component choices as LoginView:
- **Card** wrapper with `CardHeader` / `CardTitle` ("Sign Up")
- **Input** + **Label** for email, password, confirm password
- **Alert** for validation errors
- **Button** with loading state
- Bottom link: "Already have an account? Log in"

Fields: email, password (minlength 8), confirm password (must match).

## Acceptance Criteria
- [ ] Form is centered in a Card component matching LoginView style
- [ ] Three fields: email, password, confirm password — all use shadcn-vue Input + Label
- [ ] Validation errors (email required, password length, passwords match) display in Alert
- [ ] Submit button shows "Creating account..." when submitting
- [ ] "Already have an account?" link navigates to `/login`
- [ ] After signup, redirects to `query.redirect` if present, otherwise `/dashboard`
- [ ] If already authenticated on mount, redirects to `/dashboard`
- [ ] Existing SignupView tests updated and passing
- [ ] No scoped `<style>` block

## Technical Notes
- Same layout pattern as T-005 — keep them visually consistent
- The existing `validate()` function and error collection logic should not be changed
- Use the same `min-h-[60vh] flex items-center justify-center` centering pattern as LoginView

---

### T-007: [AUTH] Restyle AccountView with Tailwind + shadcn-vue

**Epic:** Navigate the app and manage my account from any page
**Type:** frontend
**Depends on:** T-001

ref: T-001

## Summary
Restyle the AccountView page (account info, change password form, delete account danger zone) to use Tailwind CSS and shadcn-vue components. All existing logic (password change API, delete account flow, session invalidation) stays unchanged.

## What to Build

### `frontend/src/views/AccountView.vue` — restyle

Three sections, each in a Card:

**Section 1: Account Info**
- Card with `CardHeader` ("Account Info") and `CardContent`
- Display user email with a Label ("Email") and the email value

**Section 2: Change Password**
- Card with `CardHeader` ("Change Password") and `CardContent`
- Form with three Input+Label fields: current password, new password, confirm new password
- Alert for errors (passwords don't match, too short, API error)
- Success state: show a green Alert/checkmark and "Redirecting to login..." message after success
- Button with loading state

**Section 3: Delete Account (Danger Zone)**
- Card with red/destructive border and heading
- Warning text explaining permanence
- Two fields: password confirmation, text confirmation ("delete my account")
- Alert for errors
- Destructive variant Button

## Acceptance Criteria
- [ ] Three Card sections: Account Info, Change Password, Delete Account
- [ ] Account Info shows user email
- [ ] Change Password form works identically — success redirects to login after 2s
- [ ] Delete Account form works identically — confirmation text, destructive button
- [ ] Danger zone Card has red/destructive border (`border-destructive`)
- [ ] Error and success messages use Alert components
- [ ] Existing AccountView tests updated and passing
- [ ] No scoped `<style>` block

## Technical Notes
- Use `variant="destructive"` on the delete button
- Use `Card` with a red border for the danger zone: `class="border-destructive/50"`
- The `code` element in the confirmation text can use a `<Badge variant="secondary">` or `<code class="bg-muted px-1 py-0.5 rounded text-sm">`
- Keep the 2-second timeout on password change success before redirect

---

### T-008: [DASH] Build resume dashboard page

**Epic:** Manage my resumes from a dashboard
**Type:** frontend
**Depends on:** T-001, T-002, T-003

ref: T-001 T-002 T-003

## Summary
Build a new ResumeDashboard page at `/dashboard` (authenticated-only) that lists the user's resumes, allows creating new resumes, deleting existing ones, and clicking a resume to open it in the builder. Uses the existing `GET /api/v1/resumes` and `POST /api/v1/resumes` endpoints.

## What to Build

### `frontend/src/views/DashboardView.vue` — new file

Layout:

```
Page header
├── "My Resumes" heading
└── "Create New Resume" button (primary, right-aligned)

Resume list (or empty state)
├── Empty state (if no resumes):
│   └── Card with icon, "No resumes yet", "Create your first resume to get started" + CTA button
│
└── Resume cards (if resumes exist):
    └── For each resume:
        ├── Name (editable? start as display-only)
        ├── Created/updated date
        ├── Click → navigates to /builder/:id
        └── Delete button (with confirmation dialog or inline confirm)

Loading state: show Skeleton cards while fetching
Error state: show Alert if fetch fails
```

### Create Resume flow
- "Create New Resume" button → calls `POST /api/v1/resumes` with default body
- On success → navigates to `/builder/:newId`
- On error → show Alert

### Delete Resume flow
- Delete button → simple confirm dialog (use a basic confirm or inline "Are you sure?" state)
- On confirm → calls `DELETE` endpoint... wait, backend has no DELETE endpoint. Check: backend has `DELETE /api/v1/auth/account` but no `DELETE /api/v1/resumes/:id`.
- **Workaround:** If no DELETE endpoint exists, either (a) hide the delete button for now with a TODO, or (b) add a basic delete endpoint in a fast-follow ticket. Choose option (a) — scope is frontend-only.
- Actually, let me re-check the backend controller... The controller has GET, GET:id, POST, PUT. No DELETE. So we just skip delete for now — add a disabled button with tooltip "Coming soon" or hide it.

### Data fetching
- On mount: `GET /api/v1/resumes` → list of `{ id, name, createdAt, updatedAt }` (ResumeSummary)
- Use `useApi()` composable from `@/shared/composables/useApi`

## Acceptance Criteria
- [ ] Page renders at `/dashboard` with "My Resumes" heading
- [ ] "Create New Resume" button calls POST, navigates to builder on success
- [ ] Resume list shows each resume as a Card with name and date
- [ ] Clicking a resume card navigates to `/builder/:id`
- [ ] Empty state renders when no resumes exist
- [ ] Loading state shows Skeleton components while fetching
- [ ] Error state shows Alert if API fetch fails
- [ ] Delete button hidden/disabled (backend DELETE endpoint doesn't exist yet) — add a comment explaining
- [ ] Auth guard works: unauthenticated users redirected to `/login`
- [ ] Tests: verify list rendering, empty state, loading state, create flow, navigation on click

## Technical Notes
- ResumeSummary type from backend: `{ id: string, name: string, createdAt: string, updatedAt: string }` — define an interface in the component or import if backend shares types
- Use `onMounted` to trigger the initial fetch
- Use Skeleton from shadcn-vue for loading cards: 3-4 skeleton cards that match the card layout
- The create POST body can be a minimal default resume — check what `CreateResumeDto` expects. If the backend has a sensible default, send an empty-ish payload. If not, pass `{ name: 'Untitled Resume', layout: 'standard', sections: [] }` or check the DTO.
- Format dates with `new Date(date).toLocaleDateString()`

---

### T-009: [BUILD] Restyle ResumeBuilder and all sub-components with Tailwind

**Epic:** Use the resume builder with a polished UI
**Type:** frontend
**Depends on:** T-001

ref: T-001

## Summary
Restyle the ResumeBuilder shell and all 15+ sub-components to use Tailwind CSS classes instead of scoped CSS. No logic, template structure, or component API changes — purely replacing `<style scoped>` blocks with Tailwind utility classes while keeping identical visual behavior.

## What to Build

### Components to restyle (replace scoped CSS with Tailwind classes)

**Shell:**
1. `frontend/src/features/builder/ResumeBuilder.vue` — grid layout, toolbar, panels

**Toolbar/Sidebar:**
2. `frontend/src/features/builder/components/PdfExportButton.vue`
3. `frontend/src/features/builder/components/LayoutPicker.vue` — layout cards, selection state
4. `frontend/src/features/builder/components/SectionToggles.vue` — toggle switches, drag handles
5. `frontend/src/features/builder/components/AnonymousBanner.vue` — warning banner
6. `frontend/src/features/builder/components/JdInput.vue` — textarea for job description

**Editor:**
7. `frontend/src/features/builder/components/SectionEditor.vue`
8. `frontend/src/features/builder/components/editors/NameContactEditor.vue`
9. `frontend/src/features/builder/components/editors/SummaryEditor.vue`
10. `frontend/src/features/builder/components/editors/ExperienceEditor.vue`
11. `frontend/src/features/builder/components/editors/EducationEditor.vue`
12. `frontend/src/features/builder/components/editors/ProjectsEditor.vue`
13. `frontend/src/features/builder/components/editors/HardSkillsEditor.vue`
14. `frontend/src/features/builder/components/editors/SoftSkillsEditor.vue`
15. `frontend/src/features/builder/components/editors/CertificationsEditor.vue`
16. `frontend/src/features/builder/components/editors/LanguagesEditor.vue`
17. `frontend/src/features/builder/components/editors/HobbiesEditor.vue`

**Preview:**
18. `frontend/src/features/builder/components/LivePreview.vue`
19. `frontend/src/features/builder/components/preview/StandardLayout.vue`
20. `frontend/src/features/builder/components/preview/TwoColumnLayout.vue`
21. `frontend/src/features/builder/components/preview/PreviewSection.vue`
22. `frontend/src/features/builder/components/preview/PreviewBulletList.vue`

**Shared:**
23. `frontend/src/features/builder/components/shared/BulletList.vue`
24. `frontend/src/features/builder/components/shared/EntryList.vue`

### Approach

For each component, replace the `<style scoped>` block with inline Tailwind classes:
- Colors: CSS variables like `var(--color-text)` → Tailwind classes like `text-slate-900` (or define custom CSS variables in the Tailwind theme if preferred)
- Spacing: hardcoded `padding: 0.5rem` → `p-2`
- Borders: `border: 1px solid var(--color-border)` → `border border-slate-200`
- Border radius: `border-radius: 0.5rem` → `rounded-lg`
- Flexbox/grid: `display: flex` → `flex`, `gap: 1rem` → `gap-4`
- Transitions: `transition: border-color 0.15s` → `transition-colors`

Where CSS variables are deeply embedded (e.g., in preview components that mimic a printed page), keep minimal scoped CSS for those specific cases (paper size, print scaling) but use Tailwind for styling.

## Acceptance Criteria
- [ ] ResumeBuilder shell uses Tailwind classes (no scoped `<style>` for styling — functional CSS like transform scaling is OK)
- [ ] All 23 sub-components converted from scoped CSS to Tailwind
- [ ] Builder looks visually identical to before (same layout, colors, spacing, hover states)
- [ ] Section toggles, layout picker, drag-to-reorder all work identically
- [ ] Live preview scaling and resize observer work identically
- [ ] Anonymous banner dismiss works
- [ ] JD input / tailor filter controls work
- [ ] PDF export button works
- [ ] All 20+ existing builder tests pass without modification (or with minimal selector updates)
- [ ] No visual regressions

## Technical Notes
- The existing CSS uses `var(--color-*)` custom properties extensively — define these as Tailwind theme extensions if needed, or map them to Tailwind's default color palette (slate for neutrals, blue for primary)
- The preview components (LivePreview, StandardLayout, TwoColumnLayout) use `transform: scale()` for the paper preview — this is functional CSS that can stay as inline style
- Editors use `<style scoped>` blocks — these may be the most complex conversions. Prioritize visual consistency.
- The `entryList`/`bulletList` shared components have more complex styling — take extra care here
- Tests: many tests use `wrapper.find('.some-class')` selectors. Since classes change, tests may need selector updates. Aim to use `data-testid` or semantic selectors (`wrapper.find('button')`) where possible to make tests resilient.

---

### T-010: [LAND] Build 404 Not Found page

**Epic:** Navigate the app and manage my account from any page
**Type:** frontend
**Depends on:** T-001, T-002, T-003

ref: T-001 T-002 T-003

## Summary
Build a friendly 404 Not Found page that catches all unmatched routes and gives users a clear path back to the app. Uses the catch-all route `/:pathMatch(.*)*` set up in T-003.

## What to Build

### `frontend/src/views/NotFoundView.vue` — new file

```
Centered content (min-h-[60vh] flex items-center justify-center):
├── Large "404" text (muted/ghost, very large — text-8xl or similar)
├── Heading: "Page not found"
├── Description: "The page you're looking for doesn't exist or has been moved."
└── Button: "Go home" (primary, links to /)
```

Simple, clean, no navigation sidebar — just the centered message with a way home.

## Acceptance Criteria
- [ ] Any unmatched URL (e.g., `/xyz`, `/foo/bar/baz`) renders the 404 page
- [ ] Page has "404", "Page not found" heading, description text, and "Go home" button
- [ ] "Go home" button navigates to `/`
- [ ] Page uses the same layout shell (App.vue navbar is visible above)
- [ ] Tests: verify rendering at unmatched routes, verify button navigates home

## Technical Notes
- Use `useRouter().push('/')` or a `<RouterLink to="/">` for the "Go home" button
- The 404 route is already defined in T-003 as `/:pathMatch(.*)*` — just create the component it points to
- Keep it minimal — no need for search, sitemap, or other fancy 404 features

---

### T-011: [AUTH] Fix signup and login auth token field name mismatch

**Epic:** Fix bugs preventing core app functionality
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Fix the signup and login flows which are currently broken due to a field name mismatch between the backend response and frontend destructuring. The backend returns `sessionToken` but the frontend expects `token` — this means the auth token is never persisted, making authentication impossible. Also fix the `/auth/me` response unwrapping.

## What to Build

### Root cause

The backend auth controller returns:
```json
// POST /api/v1/auth/signup & /api/v1/auth/login
{ "user": { "id": "...", "email": "..." }, "sessionToken": "abc123..." }

// GET /api/v1/auth/me
{ "user": { "id": "...", "email": "..." } }
```

The frontend auth store (`frontend/src/features/auth/stores/auth.ts`) destructures:
```ts
const response = await api.get<User>('/api/v1/auth/me')
user.value = response  // BUG: response is { user: {...} }, not { id, email }

const response = await api.post<{ user: User; token: string }>(
  '/api/v1/auth/login', { email, password }
)
persistToken(response.token)  // BUG: response has sessionToken, not token
user.value = response.user
```

### 1. Fix `frontend/src/features/auth/stores/auth.ts`

**`checkSession()` — fix `/me` response unwrapping:**
```ts
// Change from:
user.value = response
// To:
user.value = response.user
```

**`login()` and `signup()` — fix token field name:**
```ts
// Change the type from:
api.post<{ user: User; token: string }>
// To:
api.post<{ user: User; sessionToken: string }>

// Change from:
persistToken(response.token)
// To:
persistToken(response.sessionToken)
```

Also update the `importAndClearLocalResume` usage — it's called correctly, no changes needed.

### 2. Verify the full auth flow

- Sign up → token is persisted → user is shown as authenticated → navigate to builder
- Log in → token is persisted → user is shown as authenticated
- Page refresh → `checkSession()` correctly restores user from `/me`
- Log out → token is cleared, user is null

## Acceptance Criteria
- [ ] `persistToken` receives the actual token string (not undefined) from both signup and login
- [ ] After signup, `isAuthenticated` is true and `user.value` has correct `id` and `email`
- [ ] After login, same as above
- [ ] After page refresh, `checkSession()` restores the user from `/api/v1/auth/me`
- [ ] `user.value.email` is accessible in templates (not `undefined`)
- [ ] Existing auth tests updated to use `sessionToken` instead of `token` in mock responses
- [ ] No regressions in existing test suite

## Technical Notes
- The `useApi` composable adds `Authorization: Bearer ${token}` header — this is unaffected since it reads from localStorage directly
- The `logout()` function already works — it reads the token from the store and sends it in the Authorization header
- The type `User` is `{ id: string; email: string }` — this is correct for the unwrapped user object
- Update test mocks in `authStore.spec.ts` to return `{ user: {...}, sessionToken: 'test-token' }` instead of `{ user: {...}, token: 'test-token' }`

---

### T-012: [BUILD] Fix entry auto-expand on add and section toggle reordering

**Epic:** Fix bugs preventing core app functionality
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Fix two UX issues in the resume builder: (1) Newly added entries (jobs, education, skills) remain collapsed so users can't see the form fields to enter data — fix by auto-expanding newly created entries. (2) SectionToggles reorders items when toggling sections on/off, creating a jarring experience — fix by maintaining fixed order regardless of enabled state.

## What to Build

### Fix 1: `frontend/src/features/builder/components/shared/EntryList.vue` — auto-expand new entries

**Problem:** When the user clicks "+ Add Job" or "+ Add Education", a new entry is created and added to the list. But `expandedIds` is a local ref that starts empty, so the new entry renders collapsed. The user sees a small header reading "(New Position)" and must click it to reveal the form fields. This makes the builder appear broken.

**Fix:** Watch `entries.length` — when an entry is added (length increases), auto-expand the last entry:

```ts
import { watch } from 'vue'

// Auto-expand newly added entries
watch(
  () => props.entries.length,
  (newLen, oldLen) => {
    if (newLen > oldLen && props.entries.length > 0) {
      const lastEntry = props.entries[props.entries.length - 1]
      if (lastEntry) {
        expandedIds.value.add(lastEntry.id)
      }
    }
  }
)
```

### Fix 2: `frontend/src/features/builder/components/SectionToggles.vue` — remove reordering on toggle

**Problem:** The `orderedSections` computed separates sections into enabled and disabled groups:
```ts
const orderedSections = computed<OrderedSection[]>(() => {
  const enabled: OrderedSection[] = []
  const disabled: OrderedSection[] = []
  for (const type of SECTION_TYPES) {
    // ... splits into enabled/disabled
  }
  return [...enabled, ...disabled]
})
```

This means toggling a section off pushes it to the bottom of the list, and toggling it back on moves it to the enabled group. This creates a jumping effect that's disorienting.

**Fix:** Keep all sections in original `SECTION_TYPES` order. Just mark them as enabled/disabled — the checkbox handles the visual distinction:

```ts
const orderedSections = computed<OrderedSection[]>(() => {
  return SECTION_TYPES.map((type) => ({
    type,
    label: SECTION_LABELS[type],
    enabled: props.enabledSections.includes(type),
    column: props.columnAssignments[type] ?? 'right',
  }))
})
```

Also, disabled sections should have a visual cue (reduced opacity or muted text) to distinguish them from enabled ones. The existing `section-toggles__checkbox:not(:checked) ~ .section-toggles__label-text` CSS already makes the label muted — verify this still works after the Tailwind restyle in T-009.

## Acceptance Criteria
- [ ] Clicking "+ Add Job" in ExperienceEditor creates a new entry that is **expanded** by default (form fields visible)
- [ ] Clicking "+ Add Education" in EducationEditor creates a new entry that is **expanded** by default
- [ ] Clicking "+ Add Skill" in HardSkillsEditor adds the skill input — fields should be visible (skills don't use EntryList collapsible panels, but verify the new skill input appears correctly)
- [ ] Toggling a section on/off does NOT change its position in the list
- [ ] Disabled sections are visually distinct (muted text, grayed out toggle)
- [ ] Drag-to-reorder still works correctly for enabled sections only
- [ ] Existing tests for EntryList and SectionToggles are updated and pass

## Technical Notes
- The `watch` approach in EntryList is the simplest — alternatively, expose an `expand(id)` method and call it from the parent, but the watcher avoids API changes
- For SectionToggles, the `reorder` emit should only be available for enabled sections — disabled sections should not show the drag handle
- The `selectedSectionId` selection should still work regardless of enabled/disabled state
- The column assignment dropdown should only show for enabled sections (already the case with `v-if`)
- Both fixes are independent of the Tailwind restyle — they fix bugs in the existing code and should work before AND after T-009
