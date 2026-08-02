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
          'src/**/__tests__/**',
          'src/**/*.d.ts',
          'src/main.ts',
          'src/router/index.ts',
          // Vue boilerplate — slated for deletion in UI overhaul milestone
          'src/App.vue',
          'src/components/HelloWorld.vue',
          'src/components/TheWelcome.vue',
          'src/components/WelcomeItem.vue',
          'src/components/icons/**',
          'src/views/AboutView.vue',
          'src/views/HomeView.vue',
          'src/stores/counter.ts',
          // Builder components — will be tested in RES-37/RES-39
          'src/features/builder/ResumeBuilder.vue',
          'src/features/builder/components/SectionEditor.vue',
          'src/features/builder/components/editors/**',
          'src/features/builder/components/shared/**',
        ],
      },
    },
  }),
)
