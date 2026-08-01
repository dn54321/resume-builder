# AGENTS.md — Frontend (Vue 3 + Vite)

## Project Identity

This is the **frontend** for **resume-v3**, a resume-building application. It is a [Vue 3](https://vuejs.org/) single-page application built with Vite and TypeScript, part of a monorepo alongside a NestJS backend.

**Root package:** `frontend/`  
**Package manager:** `pnpm`  
**Runtime:** Node.js ≥ 22.18  

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
| Package Manager  | pnpm                                    |
| Dev Tools        | vite-plugin-vue-devtools                |

## Scripts (run from `frontend/`)

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
frontend/
├── index.html                  # Vite entry HTML
├── env.d.ts                    # Global type declarations (e.g. ImportMetaEnv)
├── vite.config.ts              # Vite config (plugins, aliases)
├── vitest.config.ts            # Vitest config
├── playwright.config.ts        # Playwright config
├── tsconfig.json               # Root TS config (references)
├── tsconfig.app.json           # App TS config (paths, strict flags)
├── tsconfig.node.json          # Node-side TS config (vite.config, etc.)
├── tsconfig.vitest.json        # Test TS config
├── eslint.config.ts            # ESLint flat config
├── .oxlintrc.json              # oxlint config
├── .oxfmtrc.json               # oxfmt config
├── package.json
├── public/
│   └── favicon.ico
├── e2e/
│   ├── tsconfig.json
│   └── vue.spec.ts
└── src/
    ├── main.ts                 # App entry: createApp, plugins, mount
    ├── App.vue                 # Root component
    ├── assets/
    │   ├── base.css            # CSS reset / base styles
    │   └── main.css            # Global styles
    ├── router/
    │   └── index.ts            # Vue Router config
    ├── stores/
    │   └── counter.ts          # Pinia stores (example)
    ├── components/
    │   ├── HelloWorld.vue
    │   ├── TheWelcome.vue
    │   ├── WelcomeItem.vue
    │   ├── __tests__/
    │   │   └── HelloWorld.spec.ts
    │   └── icons/
    │       └── ...
    └── views/
        ├── HomeView.vue
        └── AboutView.vue
```

### Future Feature Structure

As features are added, organize by domain:

```
src/
├── features/
│   ├── builder/                # Resume builder feature
│   │   ├── ResumeBuilder.vue    # Main builder view
│   │   ├── components/
│   │   │   ├── LayoutPicker.vue
│   │   │   ├── SectionEditor.vue
│   │   │   ├── LivePreview.vue
│   │   │   ├── JdInput.vue
│   │   │   └── PdfExport.vue
│   │   ├── composables/
│   │   │   ├── useResumeData.ts    # localStorage / API resume CRUD
│   │   │   ├── useTailor.ts        # JD filtering call
│   │   │   └── usePdfExport.ts     # jsPDF + html2canvas logic
│   │   ├── stores/
│   │   │   └── resume.ts           # Pinia store for resume state
│   │   └── types/
│   │       └── resume.ts           # Resume type definitions
│   ├── auth/
│   │   ├── LoginView.vue
│   │   ├── SignupView.vue
│   │   ├── composables/
│   │   │   └── useAuth.ts
│   │   └── stores/
│   │       └── auth.ts
│   └── ...
├── shared/
│   ├── components/             # Shared UI components
│   ├── composables/            # Shared composables
│   └── types/                  # Shared TypeScript types
├── router/
│   └── index.ts
├── App.vue
└── main.ts
```

## Routing

| Route        | View           | Auth       | Description                          |
| ------------ | -------------- | ---------- | ------------------------------------ |
| `/`          | HomeView       | None       | Landing page                         |
| `/builder`   | ResumeBuilder  | Optional   | Editor + live preview                |
| `/login`     | LoginForm      | No         | Sign in                              |
| `/signup`    | SignupForm     | No         | Create account                       |

Routes use `createWebHistory` with `import.meta.env.BASE_URL` as the base. Lazy-load feature views for code splitting:

```ts
{
  path: '/builder',
  name: 'builder',
  component: () => import('@/features/builder/ResumeBuilder.vue'),
}
```

## Coding Conventions

- Use `pnpm` as the package manager — never `npm` or `yarn`.
- Avoid inline code comments. All function and class signatures must have a docstring.
- Use verbose variable names.
- Avoid re-assigning variables once they are assigned.
- Keep things formal.
- Enum names should be plural. Enum keys should be in `SCREAMING_SNAKE_CASE`.

### Vue 3

- Use the **Composition API** with `<script setup lang="ts">` in all `.vue` files.
- Use **composables** (`use*`) for reusable stateful logic. Extract logic out of components.
- Use **Pinia stores** for global/shared state (auth session, resume data).
- Use `defineProps<T>()` and `defineEmits<T>()` with TypeScript generics (not runtime declarations).
- Prefer `ref()` over `reactive()`. Use `computed()` for derived state.
- Template markup: keep templates readable; extract complex rendering into child components.
- Avoid direct DOM manipulation — use Vue's template reactivity.

### TypeScript

- `noUncheckedIndexedAccess: true` — handle potential `undefined` from index lookups.
- Path alias `@/` maps to `src/` (configured in `tsconfig.app.json` and `vite.config.ts`).
- All functions, composables, and Pinia actions/getters should have explicit return types.
- Use interfaces for data shapes, type aliases for unions/primitives.

### Components

- **Single-file components** (`.vue`) with `<script setup>`, `<template>`, and `<style scoped>`.
- Component names: **PascalCase** (single or multi-word, as required by `vue/multi-word-component-names`).
- Props: typed via `defineProps<T>()`.
- Emits: typed via `defineEmits<T>()`.
- Slots: use `defineSlots<T>()` when typed slots are needed.
- Co-locate component-specific tests in `__tests__/` directories.

### Stores (Pinia)

- Store files: `src/stores/<name>.ts` or co-located in `src/features/<feature>/stores/<name>.ts`.
- Use **Setup Store** syntax (function-style) for consistency:

  ```ts
  export const useResumeStore = defineStore('resume', () => {
    const data = ref<Resume | null>(null)
    const isLoaded = computed(() => data.value !== null)

    async function load(id: string): Promise<void> {
      // fetch + assign
    }

    return { data, isLoaded, load }
  })
  ```

### Composables

- File naming: `use*.ts` (e.g., `useResumeData.ts`, `useTailor.ts`).
- Place in `src/composables/` for shared logic, or `src/features/<feature>/composables/` for feature-specific.
- Always return reactive refs and functions; never return raw mutable objects.

### Styling

- Use `<style scoped>` for component styles.
- Global styles in `src/assets/main.css` and `src/assets/base.css`.
- CSS class naming: keep it simple, no strict methodology required but prefer BEM-like for complex components.

## Local-First / Offline Data Flow

The application has two modes of operation:

### Anonymous User Flow

1. All resume data lives in `localStorage` under a well-known key.
2. The `useResumeData()` composable abstracts reads/writes to `localStorage`.
3. A persistent banner informs the user: *"You're not signed in. Your resume is saved only in this browser. Sign up to save it permanently."*
4. The only backend call from anon mode is `POST /api/v1/resumes/tailor` (JD filtering).

### Authenticated User Flow

1. On app load, `useAuth()` checks session validity via `GET /api/v1/auth/me`.
2. If valid, `useResumeData()` switches from `localStorage` to API calls.
3. Resume is loaded: `GET /api/v1/resumes/:id`.
4. Edits are saved via `PUT /api/v1/resumes/:id`.

### Transition: Anonymous → Authenticated

1. User signs up or logs in from the builder.
2. On successful auth, frontend calls `POST /api/v1/resumes` with the full resume payload from `localStorage`.
3. Backend creates the resume and returns the new `id`.
4. Frontend clears `localStorage` and switches to authenticated mode.

## API Client

- No third-party HTTP client is currently installed. Use the native `fetch` API.
- Create a lightweight wrapper composable `useApi()` that:
  - Prepends the backend base URL (from env: `VITE_API_BASE_URL`).
  - Attaches the auth token for authenticated requests.
  - Handles error responses consistently.
- API base URL: configure via `VITE_API_BASE_URL` in `.env` files (default `http://localhost:3000`).

## Testing

### Unit Tests (Vitest + @vue/test-utils)

- Located in `__tests__/` directories co-located with the source files.
- Pattern: `src/**/__tests__/*.spec.ts`.
- Use `@vue/test-utils` `mount()` / `shallowMount()` for component tests.
- Use Pinia's `setActivePinia(createPinia())` or `createTestingPinia()` in store-dependent tests.
- Vitest config: `vitest.config.ts` with `environment: 'jsdom'`.

```ts
// Example component test pattern
import { mount } from '@vue/test-utils'
import { createTestingPinia } from '@pinia/testing'
import HelloWorld from '@/components/HelloWorld.vue'

describe('HelloWorld', () => {
  it('renders the message', () => {
    const wrapper = mount(HelloWorld, {
      props: { msg: 'Hello Vitest' },
      global: {
        plugins: [createTestingPinia()],
      },
    })
    expect(wrapper.text()).toContain('Hello Vitest')
  })
})
```

### E2E Tests (Playwright)

- Located in `e2e/`.
- Use Playwright test runner.
- Run against the dev server or a production build.
- Config: `playwright.config.ts`.

## Linting & Formatting

- **ESLint 10** flat config in `eslint.config.ts` with:
  - `pluginVue.configs['flat/essential']` for Vue rules.
  - `vueTsConfigs.recommended` for TypeScript in `.vue` files.
  - `pluginPlaywright` for E2E tests.
  - `pluginVitest` for unit tests.
  - `pluginOxlint` integration.
- **oxlint** runs alongside ESLint for faster linting.
- **oxfmt** handles formatting via `pnpm format`.
- Run `pnpm lint` before committing.

## Environment Variables

Vite exposes env vars prefixed with `VITE_` to the client bundle. Define them in `.env` files:

```env
# .env (frontend root)
VITE_API_BASE_URL=http://localhost:3000
```

Access in code via `import.meta.env.VITE_API_BASE_URL`. Add new vars to `env.d.ts`:

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

## Vite Configuration

- **Plugins:** `@vitejs/plugin-vue`, `@vitejs/plugin-vue-jsx`, `vite-plugin-vue-devtools`.
- **Alias:** `@` → `src/` (configured in both `vite.config.ts` and `tsconfig.app.json`).
- HMR is enabled in dev mode.
- Build output goes to `dist/`.

## Dependencies to Add (from Spec)

| Package        | Purpose                        |
| -------------- | ------------------------------ |
| `jspdf`        | Client-side PDF generation     |
| `html2canvas`  | Render DOM to canvas for PDF   |

## Security

- Never hardcode API keys or secrets — use `.env` files.
- The `VITE_API_BASE_URL` should point to the backend origin.
- Anonymous user data stays in `localStorage`; never sent to the backend except during signup/login import.
- Sanitize any user-generated content before rendering in the preview (especially if injecting HTML).

## Git Workflow

- Feature branches from `main`.
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, etc.).
- PRs should pass lint + type-check + tests before merge.
