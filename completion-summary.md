## RES-49: Full-Screen Resume Preview Modal

### Changes Made

1. **New: `frontend/src/components/ui/dialog/`** — shadcn-vue Dialog component family
   - `Dialog.vue` — wraps reka-ui `DialogRoot` with `v-model:open` support
   - `DialogTrigger.vue` — wraps reka-ui `DialogTrigger`
   - `DialogContent.vue` — wraps `DialogPortal` + `DialogOverlay` + `DialogContent` with styling
   - `DialogClose.vue` — wraps reka-ui `DialogClose`
   - `index.ts` — barrel exports

2. **New: `frontend/src/features/builder/components/FullscreenPreview.vue`**
   - Dialog-based full-screen modal rendering resume at optimal scale
   - Scale computed as `min(1.0, (vw-96)/816, (vh-96)/1056)` — fits US Letter (816×1056px) in viewport
   - Renders `StandardLayout` or `TwoColumnLayout` based on `store.layout`
   - Close via X button (top-right) or Escape key (handled by reka-ui DismissableLayer)
   - Window resize listener recalculates scale
   - Scrollable wrapper at scale 1.0 when paper overflows viewport

3. **Updated: `frontend/src/features/builder/components/LivePreview.vue`**
   - Added header bar: `h-8`, `px-3`, `border-b`, with "Preview" label (left) and "Full Screen" button (right)
   - Button uses shadcn-vue `Button` with `variant="ghost"`, `size="icon-sm"`, and `Maximize2` icon
   - Button opens `FullscreenPreview` (managed via `isFullscreenOpen` ref + `v-model:open`)
   - Refactored ResizeObserver to use template ref (`bodyRef`) instead of `querySelector`

4. **Tests: `FullscreenPreview.spec.ts` (17 tests)** — all passing
   - Rendering: paper element, US Letter size, StandardLayout, TwoColumnLayout, store sections, close button
   - Display: renders actual user data from store (not just emits)
   - Scale: calculated from viewport, capped at 1.0, width-constrained, height-constrained
   - Close: button click emits `update:open false`, Escape key
   - Resize: recalculates scale, removes listener on unmount
   - Scrollable wrapper at scale 1.0

5. **Tests: `LivePreview.spec.ts` (4 new tests)** — all passing
   - Header bar with "Preview" label
   - Full-screen button with aria-label
   - Opens FullscreenPreview on button click
   - Closes FullscreenPreview when modal emits `update:open false`

### Acceptance Criteria
- [x] "Full Screen" button visible in the preview panel header
- [x] Clicking opens a modal showing the resume at the largest scale that fits the viewport
- [x] Both Standard and Two-Column layouts render correctly in full-screen
- [x] Pressing Escape closes the modal
- [x] Clicking the close button (X) closes the modal
- [x] Resizing the browser window recalculates the scale
- [x] The full-screen view is scrollable if the resume overflows the viewport at scale 1.0
- [x] 29 tests (17 FullscreenPreview + 4 new LivePreview + 8 existing LivePreview), all passing
