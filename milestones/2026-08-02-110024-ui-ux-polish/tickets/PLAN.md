# Ticket Plan — UI/UX Polish: Theming, Layout & Usability

**Milestone:** milestones/2026-08-02-110024-ui-ux-polish/SPEC.md
**Date:** 2026-08-02 11:00:24 UTC
**Total Tickets:** 8

## Epics

| # | Epic Title | User Story | Tickets |
|---|------------|------------|---------|
| 1 | Apply warm creative theme with light/dark/system toggle | As a job seeker, I want a visually warm and inviting UI with a proper color palette and theme toggle | T-001, T-002 |
| 2 | Improve editor layout and section management | As a job seeker, I want all enabled sections visible at once, data to persist across toggles, and working section reorder | T-003, T-004, T-005 |
| 3 | Enhance preview and job description UX | As a job seeker, I want full-screen preview and the job description out of my way when not in use | T-006, T-007 |
| 4 | Fix email validation on signup and login | As a visitor, I want clear, immediate feedback when my email is invalid | T-008 |

## Ticket List

### T-001: [THEME] Define color palette and theme infrastructure

**Epic:** Apply warm creative theme with light/dark/system toggle
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Define a warm, creative color palette and set up the theme infrastructure (composable, CSS custom properties, Tailwind dark mode strategy) so that all builder components can reference semantic color tokens instead of hardcoded Tailwind classes.

## What to Build

### 1. `frontend/src/shared/composables/useTheme.ts` (new)
- `Theme` type: `'light' | 'dark' | 'system'`
- Reactive `theme` ref, initialized from `localStorage('theme')` or default `'system'`
- `resolvedTheme` computed: when `'system'`, uses `window.matchMedia('(prefers-color-scheme: dark)')` to derive `'light'` or `'dark'`
- `setTheme(t: Theme)` writes to localStorage and updates `document.documentElement` class list (`dark` class on/off)
- Listen for `matchMedia` changes when in system mode
- `toggleTheme()` cycles light → dark → system
- Tests: verify localStorage persistence, class toggling, matchMedia listener

### 2. `frontend/src/assets/main.css` (update)
- Add `@theme` block with the warm creative palette:
  - `--color-primary`: amber/gold range (#f59e0b)
  - `--color-primary-foreground`: white
  - `--color-secondary`: warm rose/coral (#f43f5e)
  - `--color-background`: warm off-white (#fafaf9) / dark warm slate (#1c1917)
  - `--color-surface`: white (#ffffff) / dark surface (#292524)
  - `--color-border`: warm gray (#d6d3d1) / dark border (#44403c)
  - `--color-muted`: warm gray (#78716c)
- Set up `dark:` variants via Tailwind's class-based dark mode
- Define semantic aliases so shadcn-vue components pick up the new colors

### 3. Tailwind config verification
- Ensure `darkMode: 'class'` is configured (not `'media'`)
- Verify Tailwind v4 `@theme` directive works with the Vite plugin

## Acceptance Criteria
- [ ] `useTheme` composable available and tested
- [ ] Theme state persists across page reloads via localStorage
- [ ] `dark` class toggles on `<html>` when theme changes
- [ ] System theme changes are detected in real time when mode is `'system'`
- [ ] Color palette tokens defined in CSS and usable as Tailwind classes (e.g., `bg-primary`, `text-muted`)
- [ ] ≥90% test coverage on new code

## Technical Notes
- Use Tailwind v4's `@theme` directive (already installed from previous milestone)
- Do NOT use a third-party theme library — keep it simple
- The `shadcn-vue` components rely on CSS variables like `--background`, `--foreground`, etc. — map the warm palette to these so existing UI components inherit the theme automatically

---

### T-002: [THEME] Apply theme to builder and add theme toggle

**Epic:** Apply warm creative theme with light/dark/system toggle
**Type:** frontend
**Depends on:** T-001

ref: T-001

## Summary
Replace all hardcoded monochrome colors (`bg-white`, `gray-*`, `blue-*`) in every builder component with the new semantic palette tokens. Add a theme toggle button to the navbar so users can switch between light, dark, and system.

## What to Build

### 1. Theme toggle component
- New file: `frontend/src/components/ThemeToggle.vue`
- Uses shadcn-vue `DropdownMenu` or a simple button group
- Three options: Light (sun icon), Dark (moon icon), System (monitor icon)
- Reads/writes via `useTheme` composable
- Tests: renders all three options, clicking changes theme, highlights current selection

### 2. Update `App.vue`
- Add `<ThemeToggle />` to the navbar (after existing nav items)
- Tests: verify toggle renders in navbar

### 3. Palette migration — builder components
Replace hardcoded Tailwind color classes with palette tokens across ALL files in `frontend/src/features/builder/`:

| Old class pattern | New semantic token |
|---|---|
| `bg-white` | `bg-surface` |
| `bg-gray-50` | `bg-muted/20` |
| `bg-gray-100` | `bg-muted/30` |
| `bg-gray-200` | `bg-muted/50` |
| `border-gray-300` | `border-border` |
| `text-gray-900` | `text-foreground` |
| `text-gray-500` | `text-muted` |
| `text-gray-400` | `text-muted/70` |
| `text-blue-500` | `text-primary` |
| `bg-blue-500` | `bg-primary` |
| `bg-blue-100` | `bg-primary/15` |
| `border-blue-500` | `border-primary` |
| `focus:ring-blue-500` | `focus:ring-primary` |
| `hover:bg-blue-600` | `hover:bg-primary/90` |
| `bg-red-50` | `bg-destructive/10` |
| `text-red-600` | `text-destructive` |
| `border-red-600` | `border-destructive` |

Files to update:
- `ResumeBuilder.vue`
- `components/SectionToggles.vue`
- `components/SectionEditor.vue`
- `components/LayoutPicker.vue`
- `components/JdInput.vue`
- `components/LivePreview.vue`
- `components/PdfExportButton.vue`
- `components/AnonymousBanner.vue`
- `components/shared/EntryList.vue`
- `components/shared/BulletList.vue`
- All `components/editors/*.vue` (10 files)
- All `components/preview/*.vue` (4 files)

### 4. Verify dark mode
- Add `dark:` variants where needed (e.g., preview paper background, input fields)
- Ensure `LivePreview` paper background stays white in all themes (`bg-white` is correct here — it's simulating paper)
- Ensure text is readable in both modes

## Acceptance Criteria
- [ ] ThemeToggle component visible in navbar
- [ ] Clicking toggle cycles through Light → Dark → System
- [ ] No hardcoded `gray-*`, `blue-*`, `bg-white` (except paper) remain in any builder component
- [ ] All builder components render correctly in light mode
- [ ] All builder components render correctly in dark mode
- [ ] LivePreview paper background remains white in both modes
- [ ] All existing tests still pass with updated selectors/classes
- [ ] ≥90% coverage maintained

## Technical Notes
- Do a project-wide search for `gray-`, `blue-`, `bg-white` in builder files to catch everything
- Update test selectors if they reference old Tailwind classes (e.g., `data-testid` attributes are preferred)
- The `shadcn-vue` UI components in `components/ui/` use CSS variables — they should inherit the new palette automatically via the `@theme` block from T-001

---

### T-003: [BUILD] Fix section toggle data persistence

**Epic:** Improve editor layout and section management
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Currently, toggling a section OFF in the sidebar deletes the section and all its entries/fields from the store. Toggling it back ON creates a fresh empty section. Fix this by adding a soft `enabled` flag to `ResumeSectionState` so data is retained regardless of toggle state.

## What to Build

### 1. Update `frontend/src/features/builder/types/resume.ts`
- Add `enabled: boolean` to `ResumeSectionState` interface, defaulting to `true`

### 2. Refactor `frontend/src/features/builder/stores/resume.ts`
- Update `createDefaultSection` to include `enabled: true`
- Rewrite `toggleSection`: find the section and flip `section.enabled` — never remove from the array
- Update `enabledSections` computed: filter `sections.value.filter(s => s.enabled)` instead of mapping all sections
- Update `initializeDefaults`: all sections start enabled
- Update `toPayload`: include `enabled` in serialized section
- Update `loadFromPayload`: restore `enabled` from payload (default `true` for backward compat)
- Update `reorderSections`: only reorder enabled sections; append disabled sections at the end preserving their relative order
- Tests: verify toggle on/off preserves entries, toggle off removes from preview, toggle on restores with all data

### 3. Update `frontend/src/features/builder/components/SectionToggles.vue`
- Disabled sections should still show in the list (already the case) but the toggle should call the new soft-toggle
- No structural changes needed — the checkbox `@change` already calls `emit('toggle', section.type)`
- Tests: verify that toggling off and on preserves the section's existing data

### 4. Update `frontend/src/features/builder/components/preview/StandardLayout.vue` and `TwoColumnLayout.vue`
- These already filter by `enabledSections` computed but should work with the new soft-toggle
- Verify they only render sections where `enabled === true`
- Tests: verify disabled sections are hidden from preview

## Acceptance Criteria
- [ ] Toggling a section OFF hides it from editor and preview but keeps all entries/fields
- [ ] Toggling it back ON restores the section with all previous data visible
- [ ] Refreshing the page (localStorage/anonymous) preserves toggle state
- [ ] Saving to backend (authenticated) preserves toggle state
- [ ] Reorder only affects enabled sections; disabled sections stay at the end
- [ ] All existing tests pass with updated store logic
- [ ] ≥90% coverage maintained

## Technical Notes
- This is a **pure frontend store refactor** — no backend changes needed
- Backward compatibility: existing payloads without `enabled` field should default to `true`
- The `sections` array now always contains all 10 section types; only `enabled` changes

---

### T-004: [BUILD] Replace section editor with all-sections stacked view

**Epic:** Improve editor layout and section management
**Type:** frontend
**Depends on:** T-003

ref: T-003

## Summary
Replace the current one-at-a-time section editor with a scrollable stacked view showing all enabled sections at once. Each section has a collapsible header. Clicking a section in the sidebar smooth-scrolls to it. Clicking a disabled section enables it and scrolls to it.

## What to Build

### 1. Rewrite `frontend/src/features/builder/components/SectionEditor.vue`
Instead of rendering a single editor component based on `selectedSectionId`, render ALL enabled sections stacked vertically:

```html
<div v-for="section in store.sections.filter(s => s.enabled)" :key="section.sectionId" :ref="el => setSectionRef(section.sectionType, el)">
  <div class="collapsible-header" @click="toggleCollapse(section.sectionType)">
    <span>{{ SECTION_LABELS[section.sectionType] }}</span>
    <span>{{ isCollapsed(section.sectionType) ? '▶' : '▼' }}</span>
  </div>
  <div v-if="!isCollapsed(section.sectionType)">
    <component :is="editorMap[section.sectionType]" />
  </div>
</div>
```

- Accept `selectedSectionId` prop for scroll-to behavior
- Add `setSectionRef` map: `Record<SectionType, HTMLElement>`
- Watch `selectedSectionId` → call `scrollIntoView({ behavior: 'smooth', block: 'start' })` on the corresponding ref
- Collapse state: start with all sections expanded; persist collapsed state in a local `ref<Set<SectionType>>`
- Tests: verify all enabled sections render, clicking sidebar scrolls to correct section, collapse/expand works

### 2. Update `frontend/src/features/builder/components/SectionToggles.vue`
- Clicking a disabled section: emit `'toggle'` then emit `'select'` (enables it and scrolls to it)
- No change needed for enabled sections (clicking already emits `'select'`)
- Tests: verify disabled section click enables and selects

### 3. Update `frontend/src/features/builder/ResumeBuilder.vue`
- No structural changes needed — `selectedSectionId` binding stays the same
- Center panel content is now the stacked all-sections view

## Acceptance Criteria
- [ ] Center panel shows ALL enabled sections stacked vertically
- [ ] Each section has a colored header with section name and collapse/expand toggle
- [ ] Sections are collapsible — clicking header toggles visibility
- [ ] Clicking an enabled section in the sidebar smooth-scrolls the center panel to that section
- [ ] Clicking a disabled section in the sidebar enables it and smooth-scrolls to it
- [ ] Sidebar selection highlight updates as sections scroll into view (bonus, not required)
- [ ] All existing editor tests adapted for the new layout
- [ ] ≥90% coverage maintained

## Technical Notes
- Keep the `defineAsyncComponent` lazy loading for editors — they still load on demand
- Use `ref` with a function (`:ref="el => setSectionRef(...)"`) to populate the ref map
- Section headers should use the same color scheme as the sidebar to visually connect them

---

### T-005: [BUILD] Fix section reorder in sidebar with HTML5 drag-and-drop

**Epic:** Improve editor layout and section management
**Type:** frontend
**Depends on:** T-003

ref: T-003

## Summary
Replace the broken mousedown/mouseup hack in `SectionToggles.vue` with proper HTML5 drag-and-drop. The current implementation uses `elementFromPoint` on mouseup with no visual feedback — it fails silently. Implement `dragstart`, `dragover`, `drop`, and `dragend` events with insertion indicators.

## What to Build

### 1. Rewrite drag logic in `frontend/src/features/builder/components/SectionToggles.vue`
Replace `onDragStart` / `onMouseUp` with HTML5 DnD events:

```html
<li
  v-for="section in orderedSections"
  draggable="true"
  :class="{ 'opacity-50': dragType === section.type }"
  @dragstart="onDragStart($event, section.type)"
  @dragover.prevent="onDragOver($event, section.type)"
  @dragleave="onDragLeave($event)"
  @drop="onDrop($event, section.type)"
  @dragend="onDragEnd"
>
```

- `onDragStart`: set `event.dataTransfer.effectAllowed = 'move'`, store dragged type in `dragType` ref, add visual feedback class
- `onDragOver`: determine if cursor is in the top or bottom half of the target → set `dropIndicator` to `'above'` or `'below'` for that section type, call `event.dataTransfer.dropEffect = 'move'`
- `onDragLeave`: clear `dropIndicator` for that section type
- `onDrop`: compute new order from the dragged type + target type + indicator position, emit `'reorder'` with new ordered types array
- `onDragEnd`: clear `dragType` and `dropIndicator`
- Add a visual insertion line (a CSS border or pseudo-element) between items when `dropIndicator` matches
- Only enabled sections are draggable (disabled sections don't get the grab handle)
- Tests: verify dragstart sets data, drop reorders sections, visual indicator appears, dragend cleans up

### 2. Update `frontend/src/features/builder/stores/resume.ts`
- Verify `reorderSections` handles the new input correctly (already accepts `SectionType[]`)
- No changes expected — the existing implementation should work

## Acceptance Criteria
- [ ] Dragging a section's grab handle shows the item with reduced opacity
- [ ] Dragging over another section shows an insertion line (above or below)
- [ ] Dropping reorders the sections and the preview/editor update immediately
- [ ] Only enabled sections are draggable
- [ ] Disabled sections are not valid drop targets (they stay at the end)
- [ ] Drag end cleans up all visual state (drag ghost, insertion lines)
- [ ] Works in both light and dark mode
- [ ] All existing SectionToggles tests adapted
- [ ] ≥90% coverage maintained

## Technical Notes
- HTML5 DnD is natively supported in all modern browsers — no library needed
- `dragover` must call `preventDefault()` to allow dropping
- Use `event.clientY` vs `target.getBoundingClientRect()` to determine above/below
- Touch devices: HTML5 DnD has limited touch support. This is acceptable — the builder is desktop-first per the spec.

---

### T-006: [PREVIEW] Add full-screen resume preview modal

**Epic:** Enhance preview and job description UX
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Add a "Full Screen" button to the preview panel that opens a modal overlay showing the resume at the largest scale that fits the viewport. Users can proofread their resume at near-print size and dismiss with Escape or a close button.

## What to Build

### 1. New component: `frontend/src/features/builder/components/FullscreenPreview.vue`
- Uses shadcn-vue `Dialog` / `DialogContent` for the modal
- Renders the same `StandardLayout` or `TwoColumnLayout` based on `store.layout`
- Scales the paper to fit the viewport: `min(1.0, (viewportHeight - padding) / PAPER_HEIGHT_PX, (viewportWidth - padding) / PAPER_WIDTH_PX)`
- Paper dimensions: 816×1056px (US Letter at 96 DPI)
- Background: semi-transparent dark overlay outside the paper
- Escape key or close button dismisses
- Listen for window resize to recalculate scale
- Tests: verify both layouts render, scale calculation, close on Escape, close on button click

### 2. Update `frontend/src/features/builder/components/LivePreview.vue`
- Add a header bar above the preview paper with:
  - "Preview" label (left)
  - "Full Screen" button (right) — uses shadcn-vue `Button` with `variant="ghost"` and an expand icon
- The button opens `FullscreenPreview` (manage open state in LivePreview or via a shared composable)
- Header bar should be subtle: `h-8`, `px-3`, `border-b`
- Tests: verify full-screen button renders and opens modal

## Acceptance Criteria
- [ ] "Full Screen" button visible in the preview panel header
- [ ] Clicking opens a modal showing the resume at the largest scale that fits the viewport
- [ ] Both Standard and Two-Column layouts render correctly in full-screen
- [ ] Pressing Escape closes the modal
- [ ] Clicking the close button (X) closes the modal
- [ ] Resizing the browser window recalculates the scale
- [ ] The full-screen view is scrollable if the resume overflows the viewport at scale 1.0
- [ ] ≥90% test coverage on new component

## Technical Notes
- Reuse `PAPER_WIDTH_PX = 816` and `PAPER_HEIGHT_PX = 1056` from `LivePreview.vue` (extract to a shared constant if needed)
- The shadcn-vue `Dialog` component is already in `components/ui/` — use it directly
- Do NOT modify `StandardLayout` or `TwoColumnLayout` — they render the same regardless of context

---

### T-007: [BUILD] Move job description to modal and add toolbar

**Epic:** Enhance preview and job description UX
**Type:** frontend
**Depends on:** T-002

ref: T-002

## Summary
Remove the permanent JD footer from the builder and replace it with a modal triggered by a toolbar button. Move the Tailor/Reset buttons and filter status indicator to a compact toolbar row, freeing up screen space for the editor and preview.

## What to Build

### 1. New component: `frontend/src/features/builder/components/JdModal.vue`
- Uses shadcn-vue `Dialog` / `DialogContent`
- Contains the JD textarea (moved from `JdInput.vue`):
  - Same placeholder, same styling, same `data-testid="jd-textarea"`
  - Binds to local ref, initialized from `store.jdText` on open
- "Save" button: writes to `store.jdText` and closes the modal
- "Cancel" button: closes without saving (discards unsaved changes to textarea)
- Tests: verify save writes to store, cancel discards, textarea pre-fills from store

### 2. Update `frontend/src/features/builder/ResumeBuilder.vue`
- Remove the `<footer>` element containing `<JdInput />`
- Add a toolbar row in the header area:

```html
<header class="flex items-center justify-between pb-3 shrink-0">
  <div class="flex items-center gap-2">
    <!-- JD button -->
    <Button variant="outline" @click="jdModalOpen = true">Job Description</Button>
    <!-- Tailor + Reset buttons (from JdInput) -->
    <Button v-if="store.jdText" variant="default" :disabled="isTailoring" @click="onTailor">Tailor Resume</Button>
    <Button v-if="store.isFiltered" variant="outline" :disabled="isTailoring" @click="resetFilter">Reset Filter</Button>
  </div>
  <PdfExportButton />
</header>
<!-- Filter status indicator -->
<div v-if="store.isFiltered" class="flex items-center gap-2 pb-3 text-xs text-muted">
  <span class="px-2 py-0.5 rounded-full bg-primary/15 text-primary text-[0.6875rem] font-semibold uppercase tracking-wider">Filtered</span>
  <span>Showing relevant bullets (max {{ bulletCap }} per entry)</span>
</div>
```

- The `<JdModal>` component is rendered in the template, controlled by a local `jdModalOpen` ref
- Tailor button is disabled if no JD text is saved
- Tests: verify toolbar layout, JD button opens modal, Tailor disabled without JD

### 3. Deprecation of `JdInput.vue`
- Do NOT delete `JdInput.vue` — but its usage is removed from ResumeBuilder
- The Tailor/Reset/filter-status logic moves to `ResumeBuilder.vue` (or a new `ToolbarActions.vue` composable)
- Keep `JdInput.vue` tests as-is for now (may be removed in a cleanup ticket later)

## Acceptance Criteria
- [ ] JD textarea is no longer permanently visible in the builder footer
- [ ] "Job Description" button in the toolbar opens a modal with the textarea
- [ ] Saving in the modal writes JD text to store and closes the modal
- [ ] Canceling discards unsaved changes and closes
- [ ] "Tailor Resume" button is visible in the toolbar (disabled with hint if no JD saved)
- [ ] "Reset Filter" button appears in toolbar when a filter is active
- [ ] Filter status indicator (filtered badge + bullet cap info) shows in toolbar
- [ ] Builder layout has more vertical space for editor and preview
- [ ] All existing JdInput tests still pass
- [ ] ≥90% coverage on new code

## Technical Notes
- The `isTailoring`, `tailorError`, `bulletCap`, `tailorResume`, `resetFilter` values are currently in `useTailor` composable — call them directly from `ResumeBuilder.vue` instead of going through `JdInput`
- This ticket depends on T-002 because the toolbar buttons need the theme palette to be in place

---

### T-008: [AUTH] Add client-side email validation to signup and login

**Epic:** Fix email validation on signup and login
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Add client-side email format validation to both signup and login forms. SignupView is missing `type="email"` entirely. Both forms show a generic "Something went wrong" when the backend rejects an invalid email. Add inline validation on blur, proper error message extraction, and a more helpful fallback message.

## What to Build

### 1. Update `frontend/src/features/auth/SignupView.vue`
- Add `type="email"` to the email input (currently bare `type="text"`)
- Add `autocomplete="email"` to the email input (already on `LoginView`)
- Add `@blur` handler that validates email format and pushes a specific error:
  ```ts
  function validateEmailOnBlur() {
    // Remove existing email error
    errors.value = errors.value.filter(e => !e.startsWith('Please enter a valid email'))
    const emailValue = email.value.trim()
    if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      errors.value.push('Please enter a valid email address')
    }
  }
  ```
- Update `validate()` to include email format check (in addition to empty check)
- Tests: verify email format error shows on blur with invalid email, clears on valid, included in submit validation

### 2. Update `frontend/src/features/auth/LoginView.vue`
- Add the same `@blur` email validation (it already has `type="email"` but no inline format check)
- Tests: verify email format error shows on blur

### 3. Improve error message fallback in both views
- Replace the generic catch-all:
  ```ts
  // Before:
  errors.value.push('Something went wrong. Please try again.')
  // After:
  errors.value.push('An unexpected error occurred. Please try again.')
  ```
- Verify that `ApiRequestError` properly surfaces backend validation messages (the `err.errors` loop already extracts field-level errors — ensure the email field key matches whatever the backend returns)
- Tests: verify backend email validation error is displayed verbatim, not swallowed by fallback

## Acceptance Criteria
- [ ] SignupView email input has `type="email"`
- [ ] Both SignupView and LoginView show "Please enter a valid email address" on blur when email format is invalid
- [ ] The error message clears when the user types a valid email
- [ ] Backend validation errors for email are displayed with their actual message
- [ ] The fallback error message says "An unexpected error occurred" instead of "Something went wrong"
- [ ] All existing auth tests pass
- [ ] ≥90% coverage maintained

## Technical Notes
- Email regex: `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` — simple and catches the vast majority of invalid inputs without false positives
- The backend uses `class-validator` `@IsEmail()` which may have different criteria — client-side is a best-effort UX improvement, not a replacement for server validation
- SignupView currently has scoped `<style>` instead of Tailwind — this is known (was missed in the UI Overhaul milestone). Do NOT restyle SignupView in this ticket — only add validation logic. The restyle will be a separate ticket.
