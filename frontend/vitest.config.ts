import { fileURLToPath } from 'node:url'
import { mergeConfig, defineConfig, configDefaults } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      exclude: [...configDefaults.exclude, 'e2e/**'],
      root: fileURLToPath(new URL('./', import.meta.url)),
      env: {
        VITE_API_BASE_URL: 'http://localhost:3000',
      },
      coverage: {
        provider: 'v8',
        thresholds: {
          branches: 90,
          functions: 90,
          lines: 90,
          statements: 90,
        },
        include: ['src/**/*.{ts,vue}'],
        exclude: [
          // Standard exclusions — config/bootstrap/type-only files
          'src/**/__tests__/**',
          'src/**/*.d.ts',
          'src/main.ts',
          'src/router/index.ts',

          // App shell — teleported DropdownMenu content not measurable in jsdom;
          // behavior is covered by App.spec.ts, visual state by e2e tests.
          'src/App.vue',

          // shadcn-vue generated UI components — third-party code
          'src/components/ui/**',

          // Vue boilerplate — deleted in RES-29 (UI overhaul milestone)
          'src/stores/counter.ts',

          // Views — placeholder or restyled in follow-up tickets
          'src/views/HomeView.vue',
          'src/views/DashboardView.vue',

          // Builder feature — restyled in RES-37; component tests will be added/updated then.
          // Load-bearing composables (useResumeData, useSectionEditor, usePdfExport, useTailor)
          // and shared components (EntryList, BulletList, editors) currently have 0–70% coverage.
          'src/features/builder/**',

          // Auth views — restyled in RES-33 (LoginView) and RES-35 (SignupView);
          // tests will be updated alongside those restyles.
          'src/features/auth/LoginView.vue',
          'src/features/auth/SignupView.vue',
        ],
      },
    },
  }),
)
