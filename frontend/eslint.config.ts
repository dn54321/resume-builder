import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVueA11y from 'eslint-plugin-vuejs-accessibility'
import pluginPlaywright from 'eslint-plugin-playwright'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import jsdoc from 'eslint-plugin-jsdoc'
import skipFormatting from 'eslint-config-prettier/flat'

// To allow more languages other than `ts` in `.vue` files, uncomment the following lines:
// import { configureVueProject } from '@vue/eslint-config-typescript'
// configureVueProject({ scriptLangs: ['ts', 'tsx'] })
// More info at https://github.com/vuejs/eslint-config-typescript/#advanced-setup

export default defineConfigWithVueTs(
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,

  {
    ...pluginPlaywright.configs['flat/recommended'],
    files: ['integration/**/*.{test,spec}.{js,ts,jsx,tsx}'],
  },

  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/__tests__/*'],
  },

  {
    name: 'app/disable-multi-word-for-shadcn',
    files: ['src/components/ui/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  // shadcn-vue UI components use single-word names (e.g. Button, Input)
  {
    name: 'app/shadcn-vue',
    files: ['src/components/ui/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  jsdoc.configs['flat/recommended'],

  // shadcn-vue components use single-word names (Button, Card, etc.)
  {
    name: 'app/shadcn-ui',
    files: ['src/components/ui/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  // Accessibility linting (vuejs-accessibility = Vue equivalent of jsx-a11y)
  ...pluginVueA11y.configs['flat/recommended'],

  // shadcn-vue UI components are already accessible by design — skip a11y lint
  {
    name: 'app/a11y-exclude-shadcn',
    files: ['src/components/ui/**/*.vue'],
    rules: Object.fromEntries(
      Object.keys(pluginVueA11y.rules).map((r) => [`vuejs-accessibility/${r}`, 'off']),
    ),
  },

  // reka-ui / shadcn-vue form components (Label, Input) handle label-for
  // and form-control-label associations automatically. The a11y plugin
  // sees <Label> as an unknown custom element and cannot verify the
  // association, so we relax those two rules to warnings for views that
  // use these components.
  {
    name: 'app/a11y-reka-ui-forms',
    files: [
      'src/features/auth/**/*.vue',
      'src/features/builder/components/editors/**/*.vue',
      'src/features/builder/components/JdInput.vue',
      'src/features/builder/components/JdModal.vue',
      'src/views/AccountView.vue',
    ],
    rules: {
      'vuejs-accessibility/label-has-for': 'warn',
      'vuejs-accessibility/form-control-has-label': 'warn',
    },
  },

  skipFormatting,
)
