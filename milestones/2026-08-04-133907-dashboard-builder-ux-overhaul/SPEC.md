# Milestone: Dashboard & Builder UX Overhaul

**Date:** 2026-08-04 13:39:07 UTC
**Status:** Approved

## Summary

Overhaul the dashboard and builder UX to create a seamless editing experience.
The dashboard becomes a two-pane layout (resume list on the left, live preview on
the right), the builder gains a purely autosave-driven workflow, section
visibility/lock controls lay the groundwork for Tailor Resume filtering, the 2:1
column layout is hidden behind a feature flag, the full-screen preview button is
removed from desktop, mobile builder gets a floating action button for fullscreen
preview, and the navbar replaces the raw email with a profile icon.

## User Stories

- As a user, I want to see my resume list alongside a live preview so I can
  browse my resumes and understand what each looks like at a glance.
- As a user, I want to click "Create New Resume" on the homepage and land
  directly in the builder, not my dashboard.
- As a user, I want an autosave-driven builder so I never worry about losing
  work or clicking a save button.
- As a user, I want dropdown-based actions (edit, copy, delete) on resume cards
  so I don't accidentally trigger inline rename when trying to open a resume.
- As a user, I want eye/lock toggles on each section so I can control what
  appears in the resume and what Tailor Resume is allowed to modify.
- As a mobile user, I want a floating action button to expand the preview to
  full screen so I can see my resume clearly without being cramped.
- As a user, I want a smooth visual transition when navigating from dashboard
  to builder.
- As a user, I want the navbar to show a profile icon instead of my email
  address so the UI feels polished and privacy-respecting.

## Acceptance Criteria

- [ ] "Create New Resume" on the homepage (authenticated) creates a new resume
      via the API and navigates directly to `/builder/:id`.
- [ ] Dashboard is a two-pane layout: resume list (left, ~30-40% width) and
      live preview (right, remaining width).
- [ ] The live preview renders the selected resume's last saved state using the
      same `StandardLayout`/`TwoColumnLayout` components from the builder.
- [ ] Clicking a resume card navigates to `/builder/:id` with a smooth route
      transition animation.
- [ ] Each resume card has an ellipsis dropdown menu with three actions:
      **Rename** (inline edit), **Duplicate** (create a copy), and **Delete**
      (confirmation modal).
- [ ] Clicking the card body navigates to the builder; the dropdown trigger is
      separate so navigation and action triggers never conflict.
- [ ] The builder's manual "Save" button is removed. Autosave fires 1.5 seconds
      after the last edit with a visual indicator: "Saving…" spinner during the
      request, then "✓ Saved" that fades out after 2 seconds.
- [ ] All 10 section types show an **eye icon** (visibility toggle — clicking
      disables/enables the section) and a **lock icon** (lock toggle — prevents
      Tailor Resume from modifying this section's visibility). Tailor Resume
      toggles the eye on unlocked sections; locked sections are skipped entirely.
      Lock state is persistent and independent of filter state. Both icons are
      displayed in `SectionToggles.vue` and the section editor header.
- [ ] The full-screen preview expand button (Maximize2 icon) is removed from
      `LivePreview.vue` on desktop/tablet (≥1024px).
- [ ] The 2:1 column layout button in `LayoutPicker.vue` is hidden. It only
      appears when the query parameter `?layout=True` is present. All
      column-assignment UI in `SectionToggles.vue` is also gated behind this
      flag. The code and `TwoColumnLayout` preview component are preserved.
- [ ] The navbar shows a generic profile icon (Lucide `User` icon) in place of
      the email text. Clicking the icon opens the existing dropdown with
      "Account settings" and "Log out".
- [ ] On mobile (<1024px), the builder shows a floating action button (FAB) that
      toggles the preview between inline (embedded) and fullscreen (covers the
      entire viewport). The touch-based drag-to-resize handle is hidden on
      mobile (it doesn't work properly with touch events).
- [ ] On mobile, the stacked builder layout gives adequate height to both the
      editor (`<main>`) and the preview (`<aside>`), with the FAB as the primary
      way to see a large preview.
- [ ] Tailor Resume keyword matching engine is the default backend,
      extensibility is ensured via the existing `MatchingEngine` interface and
      the `MATCHING_ENGINE` env variable.

## Scope

### In Scope

- **Bug fix:** HomeView "Create New Resume" → POST resume, then navigate to
  `/builder/:id` (authenticated users only).
- **Dashboard redesign:** Two-pane layout with resume list + live preview.
- **Resume card dropdown:** Ellipsis menu with Rename, Duplicate, Delete.
- **Autosave:** Remove manual save button, keep autosave with visual indicator
  (Saving… / ✓ Saved).
- **Eye toggle:** Existing checkbox toggle becomes an eye icon for
  show/hide section.
- **Lock toggle:** New lock icon that sets a `locked` boolean on the section
  state. Locked sections are excluded from Tailor Resume's keyword filtering.
- **Feature flag:** Hide 2:1 column layout and column assignment behind
  `?layout=True` query parameter.
- **Profile icon:** Replace email with Lucide `User` icon in navbar.
- **Smooth transition:** `<Transition>` wrapper on `<RouterView>` in App.vue
  with a fade animation.
- **Copy/duplicate resume:** Backend endpoint or client-side approach to clone
  a resume.

### Out of Scope

- Full Tailor Resume UI redesign (keeping existing modal + toolbar button).
- 2:1 column layout functionality changes — just hide existing UI.
- Mobile-responsive dashboard (the builder already has a breakpoint at 1024px;
  dashboard changes focus on desktop).
- LLM-based tailoring (keyword engine is the default; extensibility through
  the `MatchingEngine` interface already exists).
- Real-time collaboration.
- Undo/redo system.

## Technical Approach

### Frontend

#### 1. HomeView Bug Fix

In `HomeView.vue`, replace the authenticated "Create New Resume" `RouterLink`
with a button that calls an async function:

```ts
async function handleCreateAndGo() {
  const created = await api.post<{ id: string }>('/api/v1/resumes', { sections: [] })
  router.push(`/builder/${created.id}`)
}
```

#### 2. Dashboard Two-Pane Layout

Rewrite `DashboardView.vue` to a flex/grid layout:
- **Left pane (~35%):** Resume list (scrollable) with header "My Resumes" and
  "Create New Resume" button at top.
- **Right pane (~65%):** Live preview of the last selected resume. When no
  resume is selected, show a placeholder ("Select a resume to preview").
- Clicking a resume card in the left pane sets a `selectedResumeId` ref, which
  triggers loading the full resume tree via `GET /api/v1/resumes/:id` and
  renders it using the same `StandardLayout` preview component (scaled-down
  inside the pane).

#### 3. Resume Card Dropdown

Replace the inline rename (click-to-edit on title) with a three-dot dropdown
menu using the existing `DropdownMenu` components:

- **Rename:** Opens inline edit input (same as current `startEditing` logic).
- **Duplicate:** `POST /api/v1/resumes` with the selected resume's payload
  (sans id), then append to list.
- **Delete:** Opens existing `ConfirmModal`.

The card's click handler still navigates to `/builder/:id`. The dropdown
trigger is a separate click target that stops propagation.

#### 4. Autosave

- Remove the manual "Save" button and `isSaving`/`onSaveClick` logic from
  `ResumeBuilder.vue`.
- The existing `useResumeData.setupAutoSave()` (1.5s debounce +
  sessionStorage safety net) already handles autosave.
- Add a persistent visual indicator: "Saving…" (spinner) when `isSaving` is
  true, then "✓ Saved" that fades out after 2 seconds. Keep the existing
  `showSavedConfirmation` / `savedFadingOut` pattern.
- Expose an `isSaving` ref from `useResumeData` for the builder to read.

#### 5. Eye & Lock Toggles

Extend `ResumeSectionState` in `types/resume.ts`:

```ts
export interface ResumeSectionState {
  // ... existing fields
  locked: boolean  // NEW: prevents Tailor Resume from toggling visibility
}
```

Update the store's `createDefaultSection`, `loadFromPayload`, `toPayload`, and
add a `toggleLock(sectionType)` action to handle `locked`.

In the backend, add `locked` to the `ResumeSection` Prisma model, DTOs, and
the service layer. Migration required.

In `SectionToggles.vue`, replace the checkbox/toggle switch with:
- **Eye icon** (Lucide `Eye`/`EyeOff`): toggles `enabled`
- **Lock icon** (Lucide `Lock`/`LockOpen`): toggles `locked`

These icons appear for each section row. When a section is disabled, the eye
is slashed; when locked, the lock is closed. Both show as semi-transparent
when inactive.

**How Tailor Resume interacts with eye/lock:**
- Tailor Resume's job is to toggle visibility (eye) on sections and entries
  based on keyword matching.
- If a section is **locked**, Tailor Resume skips it entirely — it never
  touches that section's `enabled` flag.
- If a section is **unlocked**, Tailor Resume may toggle `enabled` on/off
  based on keyword relevance.
- Lock state is persistent and independent of filter state. Resetting the
  filter does not affect locks.

In `useTailor.ts` / `TailorService` (keyword engine), skip entries in locked
sections during keyword matching. The keyword engine checks `section.locked`
and, if true, leaves that section's visibility unchanged.

#### 6. 2:1 Column Feature Flag

In `ResumeBuilder.vue`, check for the `layout` query parameter:

```ts
import { useRoute } from 'vue-router'
const route = useRoute()
const showTwoColumn = computed(() => route.query.layout === 'True')
```

Pass `showTwoColumn` to `LayoutPicker` and `SectionToggles`. When false:
- `LayoutPicker` only shows the "Standard" option.
- `SectionToggles` hides the column assignment dropdown.

#### 7. Profile Icon

In `App.vue`, replace the email `<span>` with:

```html
<Button variant="ghost" size="sm" class="gap-2">
  <User class="size-4" />
</Button>
```

Import `User` from `@lucide/vue`. The dropdown content remains unchanged.

#### 8. Route Transition

In `App.vue`, wrap `<RouterView>` with:

```html
<RouterView v-slot="{ Component }">
  <Transition name="fade" mode="out-in">
    <component :is="Component" />
  </Transition>
</RouterView>
```

Add fade CSS (opacity transition, 150-200ms).

#### 9. Remove Full-Screen Preview Button on Desktop

In `LivePreview.vue`, remove the `Maximize2` expand button from the header bar
when the viewport is ≥1024px. Keep the existing `FullscreenPreview` component
and modal logic for mobile use. The `FullscreenPreview` modal is repurposed as
the target for the mobile FAB (see #10).

On desktop, the preview is large enough in the resizable pane — no fullscreen
button is needed.

#### 10. Mobile Builder: FAB + Layout Fixes

**Problem:** At ≤1024px, the builder grid stacks to `auto 1fr 1fr` rows. Both
the editor (`<main>`) and preview (`<aside>`) get cramped at 1fr each. The
drag-to-resize handle doesn't work with touch events (pointer capture behaves
differently and mobile screen space is too tight for a drag handle).

**Solution:**

- **Remove resize handle on mobile:** Hide the `.resize-handle` element at
  ≤1024px (already done via `display: none !important` in the existing CSS).
- **Floating Action Button:** Add a FAB positioned at the bottom-right of the
  builder viewport (above the preview, fixed position). Tapping it expands the
  preview to fill the entire viewport using the existing `FullscreenPreview`
  modal. Tapping again (or the modal's close button) returns to the editor.
  - The FAB uses a Lucide `Eye` or `Maximize2` icon.
  - It is only visible at ≤1024px.
  - The FAB should not overlap critical content — positioned ~16px from
    bottom/right edges with appropriate z-index.
- **Better mobile row distribution:** Adjust the mobile CSS so the editor
  gets `min-height: 400px` (or `auto 1fr minmax(200px, 1fr)` rows) ensuring
  both panes are usable. The FAB is the primary way to get a large preview;
  the inline preview acts as a small "quick glance."

#### Resume Copy/Duplicate

Add `POST /api/v1/resumes/:id/duplicate` to `ResumesController`:

```ts
@Post(':id/duplicate')
async duplicate(
  @Param('id') id: string,
  @Req() req: AuthenticatedRequest,
): Promise<ResumeFull> {
  return this.resumesService.duplicate(id, req.user.id);
}
```

`ResumesService.duplicate()` fetches the full resume, clears the ID fields,
prepends `name: "Copy of <original>"`, and calls `create()`.

#### `locked` Field on ResumeSection

Add a `locked` boolean column to the `ResumeSection` Prisma model (default
`false`). Update `CreateResumeDto`, `UpdateResumeDto`, and the service layer
to handle it. Migration required.

### Database Schema Changes

- `ResumeSection` table: add `locked BOOLEAN NOT NULL DEFAULT false`

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/resumes/:id/duplicate` | **New.** Duplicate a resume. Returns the new resume. |

### Frontend Routes Affected

| Route | Component | Changes |
|-------|-----------|---------|
| `/` | `HomeView.vue` | Fix "Create New Resume" button for authenticated users |
| `/dashboard` | `DashboardView.vue` | Full rewrite to two-pane layout with live preview |
| `/builder` | `ResumeBuilder.vue` | Remove save button, add autosave indicator, feature-flag 2:1 column, eye/lock toggles, mobile FAB + layout fixes |
| `/builder/:id` | `ResumeBuilder.vue` | Same as above |
| All | `App.vue` | Profile icon, route transition |
| — | `SectionToggles.vue` | Eye/lock icons replace checkbox toggle |
| — | `LayoutPicker.vue` | Hide 2:1 column option behind feature flag |
| — | `LivePreview.vue` | Remove fullscreen expand button on desktop; FAB replaces it on mobile |
| — | `FullscreenPreview.vue` | Repurposed as target for mobile FAB |

## Dependencies

- None. All required infrastructure (auth, database, Prisma, Tailor engine
  interface) already exists.

## Decisions Made

- **Duplicate naming:** `"Copy of <original>"`.
- **Dashboard preview:** Load full resume tree on click. No preloading or
  caching for now.
- **Lock behavior:** Locked sections are skipped entirely by Tailor Resume.
  Tailor Resume's job is to toggle visibility (eye) on unlocked sections.
  Lock state is persistent and independent of any filter/reset actions.
- **Fullscreen preview on desktop:** Removed. On desktop the resizable pane
  gives enough room.
- **Mobile preview:** FAB button toggles fullscreen preview modal. Touch
  resize is removed (doesn't work).
- **Tailor Resume engine:** Keyword matching is the default (`MATCHING_ENGINE=keyword`).
  The `MatchingEngine` interface ensures extensibility for future engines.
