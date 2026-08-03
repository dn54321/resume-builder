# RES-55: Decorate login and signup pages with brand SVG illustrations

## Summary
Added decorative SVG elements (blobs, wave divider, dot patterns) to both LoginView.vue and SignupView.vue, following the same pattern used in HomeView.vue's hero section. Both auth pages now have a visually consistent branded background using the amber/rose gradient palette.

## Changes

### `frontend/src/features/auth/LoginView.vue`
- Imported `SvgIllustration` component and 5 decorative SVGs (blob-1, blob-2, blob-3, wave-divider, dot-pattern)
- Wrapped the page in a `relative min-h-screen overflow-hidden` container
- Added 3 blob illustrations positioned behind the card:
  - blob-1 (amber) — top-right corner
  - blob-2 (rose) — bottom-left corner
  - blob-3 (light amber) — off-center at lower opacity
- Added 3 dot-pattern accents scattered across the page
- Added wave divider at the bottom edge
- Card given `relative z-10` to float above decorations
- All decorative containers have `aria-hidden="true"` and `pointer-events-none`

### `frontend/src/features/auth/SignupView.vue`
- Identical decorative structure to LoginView for visual consistency

### `frontend/src/features/auth/__tests__/LoginView.spec.ts`
- Added test: "renders decorative SVG blobs with aria-hidden" — verifies at least 5 `.svg-illustration` elements, at least 4 `[aria-hidden="true"]` containers, and at least 4 `.pointer-events-none` elements

### `frontend/src/features/auth/__tests__/SignupView.spec.ts`
- Added same decorative SVG test

## Validation
- `pnpm type-check`: passed
- `pnpm lint`: passed (only pre-existing JSdoc warnings)
- `pnpm test:cov`: 35 files, 418 tests passed; coverage 93.84% (above 90% threshold)
