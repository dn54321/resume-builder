# Frontend

Vue 3 single-page application for the resume-v3 builder.

## Tech Stack

| Layer            | Choice                                  |
| ---------------- | --------------------------------------- |
| Framework        | Vue 3.5 (Composition API)               |
| Language         | TypeScript 6.0                          |
| Build Tool       | Vite 8                                  |
| Routing          | Vue Router 5 (history mode)             |
| State Management | Pinia 4                                 |
| Linter           | ESLint 10 + oxlint + eslint-plugin-vue  |
| Formatter        | oxfmt                                   |
| Unit Testing     | Vitest 4 + @vue/test-utils              |
| E2E Testing      | Playwright 1.61                         |
| Type Checking    | vue-tsc                                 |

## Setup

```bash
pnpm install
cp .env .env.local   # Edit with your backend URL
```

## Scripts

```bash
pnpm dev              # Start Vite dev server with HMR
pnpm build            # Type-check + production build
pnpm preview          # Preview production build locally
pnpm test:unit        # Run unit tests with Vitest
pnpm test:e2e         # Run E2E tests with Playwright
pnpm type-check       # Run vue-tsc type checking
pnpm lint             # Run oxlint + ESLint with auto-fix
pnpm format           # Format source with oxfmt
```

## Project Structure

```
src/
├── main.ts                 # App entry: createApp, plugins, mount
├── App.vue                 # Root component
├── assets/
│   ├── base.css            # CSS reset / base styles
│   └── main.css            # Global styles
├── router/
│   └── index.ts            # Vue Router config
├── stores/                 # Pinia stores
├── components/             # Shared components
│   └── __tests__/          # Co-located component tests
├── features/               # Feature modules
│   └── <feature>/
│       ├── <View>.vue
│       ├── components/
│       ├── composables/
│       ├── stores/
│       └── types/
└── views/                  # Route-level views
```

## Routing

| Route        | View           | Auth       |
| ------------ | -------------- | ---------- |
| `/`          | HomeView       | None       |
| `/builder`   | ResumeBuilder  | Optional   |
| `/login`     | LoginForm      | No         |
| `/signup`    | SignupForm     | No         |

Routes use `createWebHistory`. Feature views are lazy-loaded for code splitting.

## Testing

### Unit Tests

```bash
pnpm test:unit     # Vitest with jsdom
```

Tests are co-located in `__tests__/` directories. Components are mounted with `@vue/test-utils`, stores tested with `createTestingPinia()`.

### E2E Tests

```bash
npx playwright install --with-deps   # First run only
pnpm test:e2e                        # Playwright across Chromium, Firefox, WebKit
```

Playwright spins its own Vite preview server on port 4173 in CI. Locally it reuses your existing dev server on port 5173.

## Environment Variables

| Variable              | Purpose                              |
| --------------------- | ------------------------------------ |
| `VITE_API_BASE_URL`   | Backend API origin (default: `http://localhost:3000`) |

## Local-First Data Flow

**Anonymous users:** Resume data persists in `localStorage`. A banner prompts sign-up to save permanently. Only backend call is `POST /api/v1/resumes/tailor` for JD filtering.

**Authenticated users:** Resume loaded from and saved to the backend API. On successful auth, `localStorage` data is migrated to the server and cleared locally.
