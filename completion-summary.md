## Summary — RES-59: Dark mode fix for My Resumes dashboard

### Changes made

**File: `frontend/src/views/DashboardView.vue`**

1. **Resume card dates** — Changed `.resume-card__date` from hardcoded `color: #6b7280` to `color: var(--muted-foreground)`. The `--muted-foreground` variable swaps between `#71717a` (light) and `#a1a1aa` (dark), ensuring readable muted text in both modes.

2. **Empty state paragraph** — Changed `.empty-state-card p` from `color: #6b7280` to `color: var(--muted-foreground)`.

3. **Skeleton loader lines** — Changed `.skeleton-line` from `background: #e5e7eb` to `background: var(--muted)`. The `--muted` variable swaps between `#f4f4f5` (light) and `#27272a` (dark). The existing `@keyframes pulse` animation uses opacity only, which works correctly regardless of background color.

4. **Empty state card background** — Added `background: var(--color-card)` to `.empty-state-card`. Previously it had no explicit background, inheriting the page background — now it uses the card color which swaps between `#ffffff` and `#0a0a0a`.

5. **Error alert** — Replaced the hardcoded `.alert-error` scoped CSS (`background: #fef2f2`, `border: #fecaca`, `color: #b91c1c`) with Tailwind utility classes: `bg-red-50 border-red-200 text-red-800 dark:bg-red-950 dark:border-red-800 dark:text-red-200`. This follows the pattern already used in `AccountView.vue`.

6. **Hover box-shadow** — Removed hardcoded `box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08)` from `.resume-card:hover`. The shadow was invisible in dark mode. The `border-color` transition already provides sufficient hover feedback in both themes.

**File: `frontend/src/views/__tests__/DashboardView.spec.ts`**

- Updated all `.alert-error` selectors to `[role="alert"]` since the class was removed in favor of Tailwind utilities.
- Added 3 new tests:
  - Verifies error alert has dark-mode Tailwind classes (`dark:bg-red-950`, `dark:border-red-800`, `dark:text-red-200`)
  - Verifies skeleton cards render with proper class for theme-aware styling
  - Verifies empty-state card renders with background CSS var

### Validation

- **Type-check**: Passes (pre-existing tsconfig deprecation only)
- **Lint**: 0 errors (only pre-existing JSDoc warnings)
- **Tests**: 35 files, 419 tests passing
- **Coverage**: 93.84% statements, 91.44% branches, 95.06% functions, 93.82% lines — all above 90% threshold
