# Ticket Plan — Dashboard & Builder UX Overhaul

**Milestone:** milestones/2026-08-04-133907-dashboard-builder-ux-overhaul/SPEC.md
**Date:** 2026-08-04 13:39:07 UTC
**Total Tickets:** 13

## Epics

| # | Epic Title | User Story | Tickets |
|---|------------|------------|---------|
| 1 | Create resumes seamlessly | As a user, I want to click "Create New Resume" and land directly in the builder with smooth transitions | T-001, T-002 |
| 2 | Browse and manage resumes in dashboard | As a user, I want a two-pane dashboard with live preview and dropdown actions on resume cards | T-003, T-004, T-005 |
| 3 | Edit resumes with autosave | As a user, I want an autosave-driven builder so I never worry about losing work | T-006 |
| 4 | Control section visibility and Tailor behavior | As a user, I want eye/lock toggles on each section so I can control visibility and what Tailor Resume modifies | T-007, T-008, T-009 |
| 5 | Polish UI across the app | As a user, I want a profile icon in the navbar, hidden 2:1 layout, and a mobile-friendly builder | T-010, T-011, T-012 |
| 6 | Verify everything works end-to-end | As a developer, I want e2e tests covering the core flows | T-013 |

## Ticket List

### T-001: [HOME] Fix "Create New Resume" on homepage to navigate directly to builder
**Epic:** Create resumes seamlessly
**Type:** frontend
**Depends on:** none

ref: none

## Summary
The authenticated "Create New Resume" button on the homepage currently links to `/dashboard`. Fix it to create a new resume via the API and navigate directly to `/builder/:id`.

## What to Build
- Modify `frontend/src/views/HomeView.vue`
- Replace the authenticated "Create New Resume" `<RouterLink to="/dashboard">` with a `<Button>` that calls an async function
- The function POSTs to `/api/v1/resumes` with `{ sections: [] }` and navigates to `/builder/${created.id}`
- Show loading state on the button while the request is in flight
- Handle API errors gracefully (show error, stay on page)

## Acceptance Criteria
- [ ] Clicking "Create New Resume" as authenticated user calls POST /api/v1/resumes
- [ ] On success, navigates to /builder/:id
- [ ] Loading state shown during request
- [ ] API errors displayed inline
- [ ] Unauthenticated flow unchanged ("Get Started" still goes to /builder anonymously)

## Technical Notes
- Uses the existing `useApi` composable
- The `api` composable is already available in HomeView (import it)
- Existing tests in `HomeView.spec.ts` will need updating

---

### T-002: [NAV] Add route transition animation between pages
**Epic:** Create resumes seamlessly
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Add a smooth fade transition to all route changes so navigating between pages (especially dashboard → builder) feels polished.

## What to Build
- Modify `frontend/src/App.vue`
- Wrap `<RouterView>` with Vue's `<Transition>` component using named slots
- Add a `fade` transition: opacity 0 → 1 over 150-200ms with `mode="out-in"`
- The CSS should be scoped to App.vue

## Acceptance Criteria
- [ ] Navigating between any routes shows a fade animation
- [ ] No layout shift or flash during transitions
- [ ] Transition duration is 150-200ms (feels snappy)
- [ ] Existing tests pass (App.spec.ts may need minor update for transition wrapper)

## Technical Notes
- Uses `<RouterView v-slot="{ Component }">` pattern
- CSS: `.fade-enter-active, .fade-leave-active { transition: opacity 0.15s ease; }` with `.fade-enter-from, .fade-leave-to { opacity: 0; }`
- `mode="out-in"` ensures the leaving view finishes before the entering one starts

---

### T-003: [DASH] Replace inline title edit with dropdown menu on resume cards
**Epic:** Browse and manage resumes in dashboard
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Replace the current inline-click-to-edit title behavior on resume cards with an ellipsis dropdown menu containing Rename, Duplicate, and Delete actions. Clicking the card body navigates to the builder; the dropdown is a separate click target.

## What to Build
- Modify `frontend/src/views/DashboardView.vue`
- Add an ellipsis button (⋮) to each resume card header using existing `DropdownMenu` components
- **Rename:** Opens inline edit input at the top of the card (same as current `startEditing` / `commitRename` logic, triggered from dropdown)
- **Duplicate:** Calls `POST /api/v1/resumes/:id/duplicate` (built in T-004), appends the new resume to the list
- **Delete:** Opens existing `ConfirmModal`, deletes via `DELETE /api/v1/resumes/:id`
- The card's main click handler (`router.push`) stays intact; dropdown trigger stops propagation
- Remove the standalone 🗑️ delete button from the card header

## Acceptance Criteria
- [ ] Each card shows an ellipsis (⋮) button in the card header
- [ ] Dropdown opens on click with Rename, Duplicate, Delete options
- [ ] Rename triggers inline edit (existing flow preserved)
- [ ] Duplicate creates a copy and adds it to the list
- [ ] Delete shows confirmation modal and removes on confirm
- [ ] Clicking the card body (not dropdown) navigates to /builder/:id
- [ ] Dropdown click stops event propagation (no navigation)

## Technical Notes
- Existing `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent`, `DropdownMenuItem` components are in `components/ui/dropdown-menu/`
- Rename logic already exists (`startEditing`, `commitRename`, `cancelRename`) — refactor to trigger from dropdown
- Duplicate needs T-004 backend endpoint; stub/optimistic-add if endpoint not ready yet

---

### T-004: [RES] Add duplicate resume endpoint
**Epic:** Browse and manage resumes in dashboard
**Type:** backend
**Depends on:** none

ref: none

## Summary
Add a `POST /api/v1/resumes/:id/duplicate` endpoint that copies an existing resume with a new name ("Copy of <original>") and returns the new resume.

## What to Build
- Add `duplicate(id, userId)` method to `backend/src/features/resumes/resumes.service.ts`
- Add `@Post(':id/duplicate')` route to `backend/src/features/resumes/resumes.controller.ts`
- Service logic: fetch full resume via `findOne`, set name to `Copy of ${originalName}`, call `create()` with the same sections/entries/fields
- Ensure all encryption is applied to the new resume's field values (handled by `create()`)
- Write unit tests for the duplicate method and controller

## Acceptance Criteria
- [ ] `POST /api/v1/resumes/:id/duplicate` returns the new resume with `name: "Copy of <original>"`
- [ ] New resume has the same sections, entries, and fields as the original
- [ ] Field values are properly encrypted on the new resume
- [ ] Non-existent resume returns 404
- [ ] Resume belonging to another user returns 404
- [ ] Existing tests continue to pass

## Technical Notes
- Reuse `CreateResumeDto` internally (the duplicate is just a create with prefilled data)
- The `findOne` method already decrypts fields; `create` re-encrypts them — this is correct
- Add spec tests for `duplicate()` in `resumes.service.spec.ts` and `resumes.controller.spec.ts`

---

### T-005: [DASH] Redesign dashboard as two-pane layout with resume list and live preview
**Epic:** Browse and manage resumes in dashboard
**Type:** frontend
**Depends on:** T-003

ref: T-003

## Summary
Rewrite the dashboard to a two-pane layout: resume list on the left (scrollable), live preview of the selected resume on the right. When no resume is selected, show a placeholder.

## What to Build
- Rewrite `frontend/src/views/DashboardView.vue`
- **Left pane (~35% width):** Scrollable resume list with "My Resumes" heading and "Create New Resume" button at top. Reuse the card component from T-003.
- **Right pane (~65% width):** Live preview area using the existing `StandardLayout` and `TwoColumnLayout` preview components, scaled via CSS `transform: scale()`
- On card click: set `selectedResumeId`, fetch full resume via `GET /api/v1/resumes/:id`, render preview
- When no resume selected: show a centered placeholder with text "Select a resume to preview" and an icon
- The "Create New Resume" button in the dashboard header creates a resume and navigates to `/builder/:id` (same as current `handleCreateResume`)
- Loading state for the preview fetch
- Update existing tests in `DashboardView.spec.ts`

## Acceptance Criteria
- [ ] Dashboard shows two panes: resume list (left) and preview (right)
- [ ] Clicking a resume card selects it and loads its preview on the right
- [ ] Preview renders the full resume using production layout components
- [ ] Preview scales down to fit the pane (not clipped)
- [ ] Empty state with placeholder when no resume is selected
- [ ] "Create New Resume" still works (creates and navigates to builder)
- [ ] Responsive: on narrow screens (<768px), stack vertically (list on top, preview hidden/moved below)

## Technical Notes
- Use `flex` or `grid` layout with `overflow-y: auto` on the left pane
- Preview scaling: measure container width, compute `scale = (containerWidth - padding) / PAPER_WIDTH_PX`, clamp to reasonable range
- Reuse `StandardLayout` and `TwoColumnLayout` from `features/builder/components/preview/`
- The `ResumeSummary` interface already exists; add a `ResumeFull` type or use the builder's `ResumePayload`

---

### T-006: [BUILD] Remove manual save button and add autosave visual indicator
**Epic:** Edit resumes with autosave
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Remove the manual "Save" button from the builder toolbar. The existing autosave (1.5s debounce) becomes the sole save mechanism. Add a persistent visual indicator showing "Saving…" / "✓ Saved".

## What to Build
- Modify `frontend/src/features/builder/ResumeBuilder.vue`
- Remove the "Save" / "Saved" / "Saving..." button from the toolbar header
- Keep the existing autosave via `useResumeData.setupAutoSave()` (already in `onMounted`)
- Expose an `isSaving` ref from `useResumeData` so the builder can react
- Add a persistent indicator in the toolbar: shows a spinner + "Saving…" while `isSaving` is true, then "✓ Saved" that fades out after 2 seconds
- Keep the existing "✓ Saved" fade-out pattern (`showSavedConfirmation` / `savedFadingOut`)
- Update builder tests to reflect removal of save button and presence of autosave indicator

## Acceptance Criteria
- [ ] No manual "Save" button visible in the builder
- [ ] "Saving…" indicator appears during autosave requests
- [ ] "✓ Saved" appears after successful autosave and fades after 2 seconds
- [ ] Autosave still fires 1.5s after last edit (unchanged)
- [ ] SessionStorage safety net still works (unchanged)
- [ ] Dirty state and unsaved-changes navigation guard still work

## Technical Notes
- `useResumeData.saveResume()` is called by the debounced watcher — add an `isSaving` ref that wraps the call
- The existing `showSavedConfirmation` method and `savedFadingOut` ref are already in `ResumeBuilder.vue` — they become the primary indicator
- No backend changes needed

---

### T-007: [DB] Add locked column to ResumeSection schema
**Epic:** Control section visibility and Tailor behavior
**Type:** backend
**Depends on:** none

ref: none

## Summary
Add a `locked` boolean column (default `false`) to the `ResumeSection` Prisma model. Update DTOs and service layer to persist and return the field.

## What to Build
- Modify Prisma schema: add `locked Boolean @default(false)` to `ResumeSection` model
- Generate migration: `npx prisma migrate dev --name add_locked_to_resume_section`
- Update `backend/src/features/resumes/dto/create-resume.dto.ts`: add `locked` optional boolean to section DTO
- Update `backend/src/features/resumes/dto/update-resume.dto.ts`: add `locked` optional boolean to section DTO
- Update `ResumesService.createEntries()` and `update()` to persist `locked` on `ResumeSection` create
- Update response serialization to include `locked` in returned sections
- Update existing tests to verify `locked` is persisted and returned

## Acceptance Criteria
- [ ] Migration runs without errors
- [ ] `locked` defaults to `false` for existing rows
- [ ] `CreateResumeDto` accepts `locked` per section
- [ ] `UpdateResumeDto` accepts `locked` per section
- [ ] `locked` is returned in GET responses
- [ ] Existing tests pass (updated where needed)

## Technical Notes
- `locked` is stored on the `ResumeSection` row, not per-entry
- The field is NOT encrypted (it's a boolean flag, not PII)
- Prisma generate must be run after schema change: `npx prisma generate`

---

### T-008: [SEC] Add eye and lock toggles to section sidebar and editor
**Epic:** Control section visibility and Tailor behavior
**Type:** frontend
**Depends on:** T-007

ref: T-007

## Summary
Replace the checkbox/toggle switch in SectionToggles with eye (visibility) and lock (Tailor-protect) icons. Extend the resume store and types to support the `locked` flag.

## What to Build
- Modify `frontend/src/features/builder/types/resume.ts`: add `locked: boolean` to `ResumeSectionState`
- Modify `frontend/src/features/builder/stores/resume.ts`:
  - Add `toggleLock(sectionType)` action
  - Update `createDefaultSection` to set `locked: false`
  - Update `loadFromPayload` and `toPayload` to serialize/deserialize `locked`
- Modify `frontend/src/features/builder/components/SectionToggles.vue`:
  - Replace the toggle switch `<span>` with two icon buttons:
    - **Eye icon** (Lucide `Eye` / `EyeOff`): toggles `enabled`, calls `emit('toggle', ...)`
    - **Lock icon** (Lucide `Lock` / `LockOpen`): toggles `locked`, calls `emit('toggleLock', ...)`
  - Icons are semi-transparent when inactive (disabled/locked)
  - Keep drag handle and label click-to-select behavior
- Add a `toggleLock` handler in `ResumeBuilder.vue` that delegates to the store
- Update `SectionToggles` tests

## Acceptance Criteria
- [ ] Each section row shows an eye icon and a lock icon
- [ ] Eye icon toggles section visibility (enabled/disabled) — replaces old toggle switch
- [ ] Lock icon toggles locked state
- [ ] Disabled sections show EyeOff icon (slashed, semi-transparent)
- [ ] Locked sections show Lock icon (closed, semi-transparent inactive state)
- [ ] Drag-and-drop reordering still works
- [ ] Label click still navigates to section editor
- [ ] `locked` is persisted in API payloads (saved/loaded correctly)

## Technical Notes
- Import `Eye`, `EyeOff`, `Lock`, `LockOpen` from `@lucide/vue`
- The existing `emit('toggle', ...)` stays; add `emit('toggleLock', sectionType)`
- Column assignment dropdown stays (already gated by feature flag in T-011)

---

### T-009: [TAILOR] Skip locked sections during Tailor Resume keyword matching
**Epic:** Control section visibility and Tailor behavior
**Type:** frontend + backend
**Depends on:** T-008

ref: T-008

## Summary
When Tailor Resume runs keyword matching, it must skip any section where `locked === true`. Locked sections keep their current visibility (eye) state regardless of keyword matches.

## What to Build
- Modify `backend/src/features/tailor/tailor.service.ts` (or the keyword engine): before processing a section, check if `section.locked` is true. If so, skip it — leave visibility unchanged.
- Modify `frontend/src/features/builder/composables/useTailor.ts`: when applying the tailor response filter via `store.applyTailorFilter()`, skip locked sections (don't toggle `enabled` on them)
- Update store's `applyTailorFilter` to check `section.locked` before modifying `enabled`
- Update keyword engine tests to verify locked sections are untouched
- Update `useTailor.spec.ts` to verify locked sections survive filtering

## Acceptance Criteria
- [ ] Tailor Resume does not change `enabled` on locked sections
- [ ] Unlocked sections are still toggled by keyword matching as before
- [ ] Lock state persists after Tailor and after Reset Filter
- [ ] Keyword engine unit tests cover locked section behavior
- [ ] Frontend tailor tests cover locked section behavior

## Technical Notes
- The keyword engine receives the full resume including `locked` flags — it must explicitly check and skip
- In `useTailor.ts`, after receiving the tailor response, check `store.sections.find(s => s.sectionType === ...)` for `locked` before applying
- Lock is independent of filter state: resetting the filter does NOT unlock sections

---

### T-010: [NAV] Replace email with profile icon in navbar
**Epic:** Polish UI across the app
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Replace the raw email text in the navbar dropdown trigger with a generic profile icon (Lucide `User`). The dropdown (Account settings, Log out) remains unchanged.

## What to Build
- Modify `frontend/src/App.vue`
- In the authenticated nav section, replace the `<span class="text-sm max-w-[160px] truncate">{{ user?.email }}</span>` with `<User class="size-4" />` inside the `DropdownMenuTrigger` button
- Import `User` from `@lucide/vue`
- The button remains `variant="ghost" size="sm"`
- No other changes to the dropdown content

## Acceptance Criteria
- [ ] Navbar shows a User icon instead of email text when authenticated
- [ ] Clicking the icon opens the dropdown (Account settings, Log out)
- [ ] Icon is properly sized and styled (matches existing button style)
- [ ] Unauthenticated nav unchanged
- [ ] Skeleton loading state unchanged

## Technical Notes
- The existing `DropdownMenu` and `DropdownMenuTrigger` structure stays exactly the same
- Add `import { User } from '@lucide/vue'` if not already imported

---

### T-011: [PREVIEW] Remove fullscreen preview on desktop and hide 2:1 column layout behind feature flag
**Epic:** Polish UI across the app
**Type:** frontend
**Depends on:** none

ref: none

## Summary
Remove the fullscreen preview expand button (Maximize2) from LivePreview on desktop (≥1024px). Hide the 2:1 column layout option in LayoutPicker and column-assignment dropdowns in SectionToggles unless the query parameter `?layout=True` is present.

## What to Build
- Modify `frontend/src/features/builder/components/LivePreview.vue`:
  - Gate the `Maximize2` expand button on viewport width — hide at ≥1024px, show at <1024px (mobile uses FAB from T-012)
- Modify `frontend/src/features/builder/ResumeBuilder.vue`:
  - Read `route.query.layout` to determine `showTwoColumn` computed ref
  - Pass `showTwoColumn` prop to `LayoutPicker` and `SectionToggles`
- Modify `frontend/src/features/builder/components/LayoutPicker.vue`:
  - Accept `showTwoColumn` prop (default `false`)
  - When `false`, only render the "Standard" layout button; hide "2:1 Column"
- Modify `frontend/src/features/builder/components/SectionToggles.vue`:
  - Accept `showTwoColumn` prop (default `false`)
  - When `false`, hide the column assignment `<select>` dropdown
- Update tests for all affected components

## Acceptance Criteria
- [ ] Fullscreen expand button hidden at ≥1024px viewport
- [ ] Fullscreen expand button visible at <1024px (until T-012 FAB replaces it)
- [ ] LayoutPicker only shows "Standard" option by default
- [ ] LayoutPicker shows "2:1 Column" option when `?layout=True` is in URL
- [ ] Column assignment dropdown hidden in SectionToggles by default
- [ ] Column assignment dropdown visible when `?layout=True` is in URL
- [ ] TwoColumnLayout code and component are preserved (not deleted)

## Technical Notes
- Use `window.matchMedia('(min-width: 1024px)')` or a CSS media query for the fullscreen button
- The `useRoute` composable from vue-router provides query params
- `showTwoColumn` is `route.query.layout === 'True'` (exact case match)
- No backend changes needed

---

### T-012: [MOBILE] Add floating action button for fullscreen preview and fix mobile builder layout
**Epic:** Polish UI across the app
**Type:** frontend
**Depends on:** T-011

ref: T-011

## Summary
Add a floating action button (FAB) on mobile (<1024px) that expands the preview to fullscreen. Fix the mobile builder layout so both editor and preview have adequate height.

## What to Build
- Modify `frontend/src/features/builder/ResumeBuilder.vue`:
  - Add a FAB positioned `fixed` at bottom-right of the viewport, only visible at <1024px
  - FAB uses Lucide `Eye` icon (or `Maximize2`), opens the existing `FullscreenPreview` modal
  - The FAB is a circular button with shadow, ~48px, positioned 16px from bottom/right
  - Only visible when a resume is loaded (not during initial loading)
- Modify the mobile CSS in `ResumeBuilder.vue`:
  - Change stacked row distribution from `auto 1fr 1fr` to `auto minmax(400px, 1fr) minmax(200px, auto)`
  - This ensures the editor gets at least 400px and the inline preview gets at least 200px
- Hide the `FullscreenPreview` expand button in `LivePreview.vue` on mobile too (FAB replaces it)
- Update tests for the FAB and layout changes

## Acceptance Criteria
- [ ] FAB visible on viewports <1024px
- [ ] FAB hidden on viewports ≥1024px
- [ ] Tapping FAB opens FullscreenPreview modal
- [ ] Closing modal returns to builder view
- [ ] Mobile editor has adequate height (≥400px)
- [ ] Mobile inline preview has minimum height (≥200px)
- [ ] FAB does not overlap form inputs or important content
- [ ] FAB has appropriate z-index (above content, below modals)

## Technical Notes
- Use `window.matchMedia('(max-width: 1023px)')` or a `v-if` with a reactive media query
- The `FullscreenPreview` component already exists and works — just wire up the FAB to toggle it
- The FAB should use `position: fixed` so it's always accessible regardless of scroll position
- Remove the Maximize2 button from LivePreview on mobile as well (FAB is the sole fullscreen trigger on mobile)

---

### T-013: [E2E] Dashboard and builder core flow e2e tests
**Epic:** Verify everything works end-to-end
**Type:** e2e
**Depends on:** T-001, T-002, T-003, T-004, T-005, T-006, T-007, T-008, T-009, T-010, T-011, T-012

ref: T-001 T-002 T-003 T-004 T-005 T-006 T-007 T-008 T-009 T-010 T-011 T-012

## Summary
End-to-end tests covering the core flows affected by this milestone: resume creation from homepage, dashboard browsing with preview, resume card actions (rename/duplicate/delete), autosave in builder, section eye/lock toggles, and mobile FAB.

## What to Build
- Test file: `frontend/src/__tests__/dashboard-builder-flow.e2e.spec.ts` (or similar, using Playwright)
- Or split into backend e2e (`backend/test/...`) and frontend e2e as appropriate
- Flows to cover:
  1. **Homepage → Create Resume:** Login, click "Create New Resume", verify navigation to /builder/:id
  2. **Dashboard → Preview:** Navigate to /dashboard, verify two-pane layout, click resume card, verify preview renders
  3. **Resume card actions:** Rename a resume via dropdown, duplicate it, delete it
  4. **Builder autosave:** Edit resume name, wait for autosave indicator, reload page, verify name persisted
  5. **Section eye/lock:** Toggle eye on a section, verify preview updates. Lock a section, run Tailor, verify locked section unchanged
  6. **Profile icon:** Verify User icon in navbar, click to see dropdown

## Acceptance Criteria
- [ ] All flow steps pass with real backend and database
- [ ] Happy paths covered
- [ ] Error states covered (duplicate failure, delete failure)
- [ ] Database state verified after mutations
- [ ] Tests clean up after themselves

## Technical Notes
- Use Playwright for browser-based flows, supertest for backend-only flows
- The e2e test setup is in `e2e/` directory — follow existing patterns
- Use unique emails/timestamps to avoid test collisions
- Ensure test database is reset between runs
