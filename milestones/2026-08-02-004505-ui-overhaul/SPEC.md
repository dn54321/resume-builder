# Milestone: UI Overhaul — Tailwind + Component Library + Full Working Pages

**Date:** 2026-08-02 00:45:05 UTC
**Status:** Approved

## Summary

Replace the Vue boilerplate shell (HelloWorld, TheWelcome, Vue logo) with a polished, Tailwind CSS-based design using shadcn-vue as the component library. Deliver a proper welcome/landing page, restyle all auth pages (login, signup, account), add a resume dashboard, a 404 page, and a real navbar that makes the resume builder and account discoverable. The builder itself gets a Tailwind restyle but its feature logic remains untouched.

## User Stories

- As a **visitor**, I want a **welcoming landing page** that explains what the app does and gives me clear CTAs, so that I know what I'm signing up for.
- As a **visitor**, I want **polished login and signup forms** so that the app feels trustworthy and professional.
- As an **authenticated user**, I want **navigation that shows me the builder, my account, and logout** from every page, so that I can move around the app easily.
- As an **authenticated user**, I want a **dashboard listing my resumes** so that I can create, open, and manage multiple resumes.
- As a **user**, I want a **proper 404 page** when I hit a bad URL, so that I'm not just staring at a broken page.

## Acceptance Criteria

- [ ] Landing page at `/` replaces the Vue boilerplate with real marketing content (hero, features, CTAs)
- [ ] shadcn-vue component library installed and configured with Tailwind CSS
- [ ] Tailwind CSS replaces the current `main.css` / `base.css` custom styles
- [ ] New `App.vue` shell with a responsive navbar (brand, nav links, auth state-aware controls)
- [ ] Login page (`/login`) restyled with Tailwind + shadcn-vue components
- [ ] Signup page (`/signup`) restyled with Tailwind + shadcn-vue components
- [ ] Account page (`/account`) restyled with Tailwind + shadcn-vue components
- [ ] Resume dashboard page (`/dashboard`) with list of user's resumes, create/delete actions
- [ ] 404 catch-all page for unmatched routes
- [ ] Builder page (`/builder`) restyled with Tailwind (no logic changes)
- [ ] All Vue boilerplate components removed (HelloWorld, TheWelcome, WelcomeItem, icon components, logo.svg)
- [ ] `/about` route removed (not relevant for a resume builder tool)
- [ ] `index.html` title changed from "Vite App" to "Resume Builder"
- [ ] Every new page/component has tests maintaining ≥90% coverage

## Scope

### In Scope

- Install and configure **Tailwind CSS v4** (latest) with the Vite plugin
- Install and configure **shadcn-vue** (button, input, card, form, dialog, dropdown-menu, and other primitives as needed)
- **App.vue** shell rewrite: responsive navbar with brand/logo, nav links, auth state
- **Welcome page** (`/`): hero headline + subheading + CTA buttons (sign up / log in), 3-4 feature highlights, clean footer
- **Resume dashboard** (`/dashboard`): authenticated-only, lists user's resumes by name + date, "Create new resume" button, delete action, click to open in builder
- **Login page**: restyled with Tailwind + shadcn-vue (card layout, branded inputs, validation errors)
- **Signup page**: restyled with Tailwind + shadcn-vue
- **Account page**: restyled with Tailwind + shadcn-vue (account info card, change password form, danger zone for delete)
- **404 page**: catch-all route with a friendly message and link back home
- **Builder page**: Tailwind restyle of the shell (grid layout, toolbar, sidebar, panels), sub-components (LayoutPicker, SectionToggles, SectionEditor, LivePreview, JdInput, AnonymousBanner, PdfExportButton) stay functionally identical but use Tailwind classes
- Remove all Vue boilerplate: HelloWorld.vue, TheWelcome.vue, WelcomeItem.vue, IconCommunity.vue, IconDocumentation.vue, IconEcosystem.vue, IconSupport.vue, IconTooling.vue, logo.svg
- Remove `/about` route and AboutView.vue
- Remove/modernize `base.css` and `main.css` — replaced by Tailwind's `@import "tailwindcss"` in main entry
- Tests for all new pages and components (vitest + @vue/test-utils)
- `index.html` title → "Resume Builder" (or TBD)

### Out of Scope

- Backend changes — no new API endpoints, no schema changes
- Forgot/reset password flow (requires backend email integration)
- Email verification on signup
- Builder feature logic changes (editors, previews, PDF export, tailor/JD matching)
- Responsive/mobile optimization beyond reasonable defaults (table focus is desktop)
- Dark mode toggle (the Tailwind setup supports it, but no toggle UI in this milestone)
- Internationalization / i18n
- E2E tests (Playwright)

## Technical Approach

### Component library: shadcn-vue

**Why shadcn-vue over alternatives:**
- Free and open source (MIT)
- Built on Radix Vue for WAI-ARIA accessibility compliance
- Copy-paste components — no heavy npm dependency, full control over source
- Designed for Tailwind CSS — seamless integration
- Actively maintained and popular in the Vue 3 ecosystem

**Components we'll use:**
- `Button` (variants: default, outline, ghost, destructive)
- `Input` (form fields)
- `Card` (Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter)
- `Label` (form labels)
- `DropdownMenu` (user menu in navbar)
- `Separator` (visual dividers)
- `Badge` (status indicators, feature highlights)
- `Skeleton` (loading states for dashboard)
- `Alert` / `AlertDescription` (error/success messages)

### Navigation / Routes

| Path | Name | Component | Auth Required |
|------|------|-----------|---------------|
| `/` | home | Welcome page | No |
| `/login` | login | LoginView (restyled) | No (redirects to /dashboard if authed) |
| `/signup` | signup | SignupView (restyled) | No (redirects to /dashboard if authed) |
| `/dashboard` | dashboard | ResumeDashboard | Yes |
| `/builder` | builder | ResumeBuilder (restyled) | No (shows AnonymousBanner; for authed users, `/dashboard` is the entry point) |
| `/builder/:id` | builder-edit | ResumeBuilder (loads specific resume) | Yes |
| `/account` | account | AccountView (restyled) | Yes |
| `/:pathMatch(.*)*` | not-found | NotFoundView | No |

### API endpoints (existing, no changes)

| Method | Path | Used By |
|--------|------|---------|
| GET | `/api/v1/auth/me` | App.vue (check session on mount) |
| POST | `/api/v1/auth/signup` | SignupView |
| POST | `/api/v1/auth/login` | LoginView |
| POST | `/api/v1/auth/logout` | Navbar / AccountView |
| POST | `/api/v1/auth/change-password` | AccountView |
| DELETE | `/api/v1/auth/account` | AccountView |
| GET | `/api/v1/resumes` | ResumeDashboard |
| POST | `/api/v1/resumes` | ResumeDashboard (create new) |
| GET | `/api/v1/resumes/:id` | ResumeBuilder (load existing) |
| PUT | `/api/v1/resumes/:id` | ResumeBuilder (auto-save) |

### Database schema changes

None.

### Frontend directory structure (new/changed)

```
frontend/src/
├── App.vue                    # REWRITE: navbar shell, no boilerplate
├── main.ts                    # UPDATE: import tailwind, remove main.css
├── index.html                 # UPDATE: title tag
├── assets/
│   ├── base.css               # REMOVE
│   ├── main.css               # REWRITE: @import "tailwindcss"
│   └── logo.svg               # REMOVE
├── components/
│   ├── HelloWorld.vue         # REMOVE
│   ├── TheWelcome.vue         # REMOVE
│   ├── WelcomeItem.vue        # REMOVE
│   ├── icons/                 # REMOVE (all 5)
│   └── ui/                    # NEW: shadcn-vue components (button, card, input, etc.)
├── router/
│   └── index.ts               # UPDATE: add /dashboard, /builder/:id, 404 catch-all, remove /about
├── views/
│   ├── HomeView.vue           # REWRITE: welcome/landing page
│   ├── AboutView.vue          # REMOVE
│   ├── AccountView.vue        # UPDATE: Tailwind + shadcn-vue restyle
│   ├── DashboardView.vue      # NEW: resume list with create/delete
│   ├── NotFoundView.vue       # NEW: 404 page
│   └── __tests__/             # NEW tests
├── features/
│   ├── auth/
│   │   ├── LoginView.vue      # UPDATE: Tailwind + shadcn-vue restyle
│   │   ├── SignupView.vue     # UPDATE: Tailwind + shadcn-vue restyle
│   │   └── __tests__/         # UPDATE: adapt tests for new markup
│   └── builder/
│       ├── ResumeBuilder.vue  # UPDATE: Tailwind restyle (no logic changes)
│       ├── components/        # UPDATE: Tailwind classes in all sub-components
│       └── __tests__/         # UPDATE: adapt tests for new markup
└── shared/
    └── composables/
        └── useApi.ts          # NO CHANGE (already solid)
```

### Tailwind setup

```bash
npm install -D tailwindcss @tailwindcss/vite
```

`vite.config.ts` will add the Tailwind plugin. `src/assets/main.css` becomes:

```css
@import "tailwindcss";
```

shadcn-vue components go in `src/components/ui/` and are configured via `components.json` at the project root.

## Dependencies

- **None.** No other milestones or infrastructure changes are required. This is purely a frontend restyle + new pages using existing backend APIs.

## Decisions

- **App name:** "Resume Builder" — used in `<title>`, navbar brand, and page headings.
- **Component library:** shadcn-vue (confirmed). Free, MIT-licensed, Tailwind-native, accessible (Radix Vue), copy-paste components.
- **Favicon:** Create a simple SVG favicon (a document/R icon) in this milestone.
- **Builder route (`/`) without `:id`:** Keep auto-init behavior for anonymous users. For authenticated users, `/dashboard` is the entry point where they create named resumes.
- **Builder sub-components restyle:** Use Tailwind utility classes. No logic or template structure changes — just replace scoped `<style>` blocks with Tailwind classes wherever possible.

## Open Questions

_None remaining._
