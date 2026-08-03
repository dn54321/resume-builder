## RES-57: ConfirmModal — reusable confirmation dialog component

### Summary

Created `frontend/src/components/ui/ConfirmModal.vue` — a reusable confirmation dialog component that can be used for delete confirmations, unsaved changes guards, and other confirmation flows.

### Files Changed

- **Created:** `frontend/src/components/ui/ConfirmModal.vue`
- **Created:** `frontend/src/components/ui/__tests__/ConfirmModal.spec.ts`

### Component Features

| Feature | Implementation |
|---------|---------------|
| Props | `open` (boolean), `title` (string), `description` (string), `confirmLabel` (string, default "Confirm"), `variant` ('destructive' \| 'default') |
| Emits | `confirm`, `cancel` |
| Card & Button | Uses existing shadcn-style `Card` and `Button` components |
| Backdrop | Fixed `bg-black/50` overlay, click-to-dismiss |
| Responsive | Centered on screen, `max-w-[400px]`, horizontal padding via `mx-4` |
| Scroll lock | Uses `@vueuse/core` `useScrollLock` on `document.body` |
| Theme support | Uses CSS variables (`bg-card`, `text-card-foreground`, `text-muted-foreground`, button variants) that respect light/dark |
| Accessibility | `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby`/`aria-describedby` with `useId()`, focus trap (Tab/Shift+Tab), Escape to cancel, focus restored on close |

### Test Coverage

32 tests across 8 describe blocks:
- **Rendering** (6): open/closed state, re-rendering on prop change, title/description display
- **Props** (5): default/custom confirmLabel, Cancel button presence, default/destructive variant classes
- **Events** (5): confirm/cancel button clicks, backdrop click, Escape key, no emit when closed
- **Accessibility** (5): role, aria-modal, aria-labelledby/describedby linkage, focus on open, focus trap cycling
- **Scroll lock** (3): locked when open, not locked when closed, restored on prop change
- **Responsive/styling** (3): backdrop class, max-width, centering flex classes
- **Cleanup** (2): scroll restored on unmount, no throw when unmounted while closed

### Validation

- TypeScript: `vue-tsc --build` passes with zero errors
- Lint: `oxlint` passes, `eslint` has only jsdoc warnings (no errors)
- Tests: All 448 tests pass across 36 test files
- Coverage: 93.84% statements, 91.44% branches, 95.06% functions, 93.82% lines (all above 90% threshold)
