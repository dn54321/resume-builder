## RES-47: Theme palette migration for builder components

### Changes Made

**1. Added `--color-surface` token to theme (`frontend/src/assets/main.css`)**
- Added `--color-surface: #ffffff` (light) / `--color-surface: #0a0a0a` (dark) to the `@theme inline` block
- Used for panel/card backgrounds that were previously `bg-white`

**2. Palette migration — all builder components**
Systematically replaced hardcoded Tailwind color classes across ALL files in `frontend/src/features/builder/`:

| Old class | New token |
|-----------|-----------|
| `border-gray-300` | `border-border` |
| `border-gray-200` | `border-border` |
| `border-blue-500` | `border-primary` |
| `border-red-600` | `border-destructive` |
| `bg-white` (panels/cards) | `bg-surface` |
| `bg-gray-50` | `bg-muted/20` |
| `bg-gray-100` | `bg-muted/30` |
| `bg-gray-200` | `bg-muted/50` |
| `bg-gray-300` | `bg-muted/50` |
| `bg-blue-500` | `bg-primary` |
| `bg-blue-50` | `bg-primary/10` |
| `bg-blue-100` | `bg-primary/15` |
| `bg-red-50` | `bg-destructive/10` |
| `hover:bg-blue-100` | `hover:bg-primary/15` |
| `hover:bg-gray-100` | `hover:bg-muted` |
| `hover:bg-gray-200` | `hover:bg-muted/50` |
| `hover:bg-red-50` | `hover:bg-destructive/10` |
| `hover:bg-blue-600` | `hover:bg-primary/90` |
| `hover:border-blue-500` | `hover:border-primary` |
| `hover:border-gray-400` | `hover:border-muted-foreground/50` |
| `hover:text-blue-500` | `hover:text-primary` |
| `hover:text-blue-600` | `hover:text-primary/90` |
| `hover:text-red-600` | `hover:text-destructive` |
| `text-gray-900` | `text-foreground` |
| `text-gray-700` | `text-neutral-700` (preview paper) |
| `text-gray-500` | `text-muted-foreground` |
| `text-gray-400` | `text-muted-foreground/70` or `text-neutral-400` (preview paper) |
| `text-gray-300` | `text-muted-foreground/40` |
| `text-blue-500` | `text-primary` |
| `text-blue-700` | `text-primary` |
| `text-red-600` | `text-destructive` |
| `text-white` | `text-primary-foreground` |
| `focus:border-blue-500` | `focus:border-primary` |
| `focus:ring-blue-500` | `focus:ring-primary` |
| `peer-checked:bg-blue-500` | `peer-checked:bg-primary` |
| `disabled:bg-gray-100` | `disabled:bg-muted/30` |
| `disabled:text-gray-400` | `disabled:text-muted-foreground/70` |

**Files updated (24 files):**
- ResumeBuilder.vue
- SectionToggles.vue
- SectionEditor.vue
- LayoutPicker.vue
- JdInput.vue
- JdModal.vue
- LivePreview.vue
- PdfExportButton.vue
- AnonymousBanner.vue
- shared/EntryList.vue
- shared/BulletList.vue
- editors/NameContactEditor.vue
- editors/SummaryEditor.vue
- editors/ExperienceEditor.vue
- editors/EducationEditor.vue
- editors/HardSkillsEditor.vue
- editors/SoftSkillsEditor.vue
- editors/CertificationsEditor.vue
- editors/ProjectsEditor.vue
- editors/LanguagesEditor.vue
- editors/HobbiesEditor.vue
- preview/StandardLayout.vue
- preview/TwoColumnLayout.vue
- assets/main.css

Plus test file updates (4 files):
- SectionEditor.spec.ts
- JdInput.spec.ts
- SectionToggles.spec.ts
- LayoutPicker.spec.ts

**3. LivePreview paper background preserved**
- Paper background stays `background: #fff` in scoped CSS (not `bg-white` class)
- Preview text uses `text-neutral-*` to stay dark on always-white paper
- Preview area background uses `bg-muted/50` for theme-aware surround

**4. ThemeToggle and App.vue already complete**
- ThemeToggle.vue component was already built in RES-44
- App.vue already includes `<ThemeToggle />` in the navbar
- Tests already exist: renders all three options, clicking changes theme, highlights current

### Test Results
- ✅ All 35 test files passing (416 tests)
- ✅ Coverage: 93.84% statements, 91.44% branches, 95.06% functions, 93.82% lines (all ≥90%)
- ✅ TypeScript type-check passes (only deprecation warning for `baseUrl`)
- ✅ Lint passes clean

### Notable Decisions
- `text-gray-700` in preview components → `text-neutral-700` (not theme-aware) because these render on always-white paper and must remain readable
- `text-muted` from the mapping table → `text-muted-foreground` because `--color-muted` is a background color (`#f4f4f5`), not suitable for text
- `after:bg-white` on the toggle switch knob intentionally preserved — it's a UI control element, not a panel background
- `text-green-600` left as-is — not in the ticket's mapping table, used for JD relevance indicators
