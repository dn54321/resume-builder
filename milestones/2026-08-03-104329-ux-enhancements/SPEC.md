# Milestone: UX Enhancements

**Date:** 2026-08-03 10:43:29 UTC
**Status:** Approved

## Summary

A collection of UX improvements across the resume builder, dashboard, and auth pages:
make the live preview resizable, replace destructive prompts with a Save workflow,
guard against accidental data loss on navigation, fix dark-mode readability on the
dashboard, add resume delete and rename capabilities, and decorate the auth pages
to match the brand identity established on the landing page.

## User Stories

- As a **job seeker**, I want to **adjust the width of the resume preview** so that I can see my resume at a comfortable size while editing.
- As a **job seeker**, I want to **explicitly save my changes** rather than rely on auto-save, so that I feel in control of when my data is persisted.
- As a **job seeker**, I want to **be warned if I try to leave the builder with unsaved changes** so that I don't accidentally lose my work.
- As a **logged-in user**, I want to **see "My Resumes" and "Log out" in the nav** instead of "Log in" / "Sign up" so the UI reflects my authenticated state.
- As a **user**, I want to **read my resume cards on the dashboard in dark mode** so that the UI is usable regardless of theme.
- As a **user**, I want to **delete resumes I no longer need** so that my dashboard stays organized.
- As a **user**, I want to **name my resumes** so that I can tell them apart without opening each one.
- As a **visitor**, I want the **login and signup pages to feel visually consistent** with the rest of the site so that the experience feels polished and trustworthy.

## Acceptance Criteria

### Resizable Preview
- [ ] A draggable handle sits between the editor column and the live preview column
- [ ] Dragging left/right resizes the preview pane (within min/max bounds)
- [ ] The preview scale recalculates as the pane resizes
- [ ] On mobile / narrow viewports, the drag handle is hidden (stacked layout)

### Save Workflow
- [ ] A "Save Changes" button is visible at the bottom of the builder (or in the toolbar)
- [ ] Clicking Save triggers an explicit save and shows a brief "Saved" confirmation
- [ ] Auto-save continues to run in the background as a safety net
- [ ] If there are unsaved changes when navigating away (router nav or browser close), a confirmation dialog appears

### Auth-Aware Navigation (verify — likely already complete)
- [ ] When logged in, the header shows "My Resumes" and a logout dropdown (no "Log in" / "Sign up")
- [ ] When logged out, the header shows "Log in" / "Sign up" (no "My Resumes" / logout)

### Dark Mode Dashboard
- [ ] Resume cards are readable in both light and dark themes
- [ ] Skeleton loading placeholders adapt to the current theme
- [ ] Empty-state text and icons are visible in dark mode
- [ ] Date text and other secondary text use theme-aware color tokens

### Delete Resume
- [ ] Each resume card on the dashboard has a delete action (icon button or menu)
- [ ] Clicking delete opens a custom-styled confirmation modal ("Delete [name]?" with Cancel/Delete buttons)
- [ ] Confirming delete calls `DELETE /api/v1/resumes/:id` and removes the card from the list
- [ ] The backend cascade-deletes all sections, entries, and fields belonging to the resume

### Name Resumes
- [ ] A `name` column is added to the `Resume` table (nullable, defaults to `"Untitled"`)
- [ ] The resume card on the dashboard displays the name instead of the layout string
- [ ] Users can rename a resume inline (click-to-edit on the card, or editable in the builder header)
- [ ] The "Create New Resume" flow sets the default name to `"Untitled"`
- [ ] PUT /api/v1/resumes/:id accepts an optional `name` field

### Auth Page Decoration
- [ ] Login and signup pages show decorative SVG elements (blobs, dot patterns, or waves) in the background
- [ ] Decorations use the same amber/rose gradient palette as the landing page
- [ ] The cards remain clean and readable over the decorated background
- [ ] Decorations are `aria-hidden` and `pointer-events-none`

## Scope

### In Scope
- Drag-handle resizer for the builder's preview panel
- Save button + unsaved-changes guard (beforeunload + vue-router beforeEach)
- Dashboard dark-mode CSS fixes (theme tokens instead of hardcoded colors)
- `DELETE /api/v1/resumes/:id` endpoint with cascade
- `name` field on Resume: DB migration, DTO update, UI for editing
- Decorative SVG backgrounds on LoginView and SignupView

### Out of Scope
- Resizing the left sidebar (section toggles panel)
- Undo/redo history
- Bulk delete or multi-select on dashboard
- Resume duplication
- Renaming from within the builder page (just inline on dashboard cards for now)
- Changing the auth flow (OAuth, magic link, etc.)

## Technical Approach

### Backend

#### Database migration — `name` on Resume
```prisma
model Resume {
  // … existing fields …
  name      String?  // ADD: user-given display name (nullable, defaults to "Untitled" at app level)
}
```

#### DELETE endpoint
- **`DELETE /api/v1/resumes/:id`** — Deletes the resume if it belongs to the authenticated user. Returns 204 No Content.
- Cascade behavior: existing `onDelete: Cascade` on children (ResumeSection, SectionEntry, SectionField) handles cleanup automatically.
- The controller already uses `AuthGuard` — just add a `@Delete(':id')` handler.

#### Name in DTOs
- `CreateResumeDto`: add `@IsOptional() @IsString() name?: string`
- `UpdateResumeDto`: add `@IsOptional() @IsString() name?: string`
- `findAll` response (`ResumeSummary`): add `name` field

### Frontend

#### Confirmation modal component (shared)
- Create a reusable `ConfirmModal.vue` in `components/ui/` (alongside existing shadcn components)
- Props: `open` (boolean), `title` (string), `description` (string), `confirmLabel` (string), `variant` ('destructive' | 'default')
- Emits: `confirm`, `cancel`
- Uses existing `Card`, `Button`, and a fixed backdrop with `bg-black/50`
- Responsive: centered on screen, max-width ~400px, scroll-locks body
- Used by both delete-resume (destructive) and unsaved-changes (default) flows

#### Resizable preview
- Add a `div` drag handle between the center editor column and right preview column
- Use pointer events (`pointerdown`/`pointermove`/`pointerup`) on the handle
- Adjust the grid column template dynamically: `grid-template-columns: [sidebar] 240px [editor] 1fr [handle] 4px [preview] {dynamic}fr`
- Min preview width: 300px (below which the scale gets too small); max: 2fr equivalent
- The existing `ResizeObserver` in LivePreview already recalculates scale on width change — no change needed there

#### Save button + unsaved changes guard
- Add a `dirty` ref to the builder (set true on any store mutation, false after save)
- Add a "Save Changes" button in the builder toolbar area
- On save: call `saveResume()`, set dirty=false, show a brief "Saved" toast/tooltip
- `beforeunload` handler: if dirty, set `event.returnValue = ''` (browser standard)
- vue-router `beforeEach` guard in the builder: if dirty, show the `ConfirmModal` with title "Unsaved Changes" and description "You have unsaved changes. Leave anyway?"

#### Dashboard dark mode fix
- Replace hardcoded hex values in DashboardView.vue with theme tokens:
  - `color: #6b7280` → `color: var(--muted-foreground)` or Tailwind `text-muted-foreground`
  - `background: #e5e7eb` (skeleton) → use Tailwind `bg-muted` or CSS `var(--muted)`
  - `border-color: var(--color-border)` — this already works; verify

#### Delete resume on dashboard
- Add `api.del(\`/api/v1/resumes/\${id}\`)` call in DashboardView
- Add a delete icon button (trash icon) on each resume card
- Confirmation: custom-styled modal using existing shadcn-style components (`Card` + `Button` + dark backdrop)
  - Modal shows: "Delete [resume name]?" with secondary text "This action cannot be undone."
  - Two buttons: "Cancel" (outline) and "Delete" (destructive variant)
  - Modal respects light/dark theme via existing CSS variables
- After successful delete, remove the resume from the local array

#### Name resumes
- Dashboard card: replace `{{ resume.layout }}` with `{{ resume.name || 'Untitled' }}`
- Add click-to-edit: clicking the name swaps to an input field; on blur/enter, call PUT with the new name
- Include `name` in the `ResumeSummary` interface in DashboardView

#### Auth page decoration
- Import decorative SVGs from the existing `assets/illustrations/decorative/` (blob-1, blob-2, blob-3, dot-pattern, wave-divider)
- Add positioned blob divs behind the card, similar to how `HomeView.vue` does it
- Use `SvgIllustration` component (already exists)
- Apply `aria-hidden="true"` and `pointer-events-none` to decorative elements

### Frontend routes/components affected
| Route/Component | Changes |
|---|---|
| `ResumeBuilder.vue` | Drag handle, Save button, dirty tracking, navigation guard |
| `LivePreview.vue` | None (ResizeObserver already handles width changes) |
| `DashboardView.vue` | Delete button, inline rename, dark-mode CSS fixes, `name` display |
| `LoginView.vue` | Decorative background SVGs |
| `SignupView.vue` | Decorative background SVGs |
| `App.vue` | Verify auth-aware nav (likely no changes needed) |

## Dependencies

- None — this milestone is self-contained. The backend DELETE and name migration are additive; no other milestone depends on them.

## Decisions

1. **Save button placement**: Toolbar, next to the PDF export button. Keeps it visible without eating vertical space; fits naturally alongside existing toolbar actions.
2. **Inline rename UX**: Click-to-edit directly on the dashboard card title. Click the name → it becomes an input → blur/enter saves. Simplest and most discoverable.
3. **Unsaved changes when auto-save is pending**: Warn anyway. The dirty flag stays set until save completes — this is the safest approach and avoids edge cases.
4. **Delete confirmation**: Custom-styled modal using existing shadcn-style components (`Card` + `Button` + backdrop). Consistent with the rest of the UI and supports both themes.

## Tickets

| Ticket | Description | Dependencies |
|--------|-------------|-------------|
| [RES-57](https://linear.app/resume-builder-v3/issue/RES-57) | ConfirmModal component | — |
| [RES-56](https://linear.app/resume-builder-v3/issue/RES-56) | Resizable preview pane | — |
| [RES-54](https://linear.app/resume-builder-v3/issue/RES-54) | Save button + unsaved changes guard | RES-57 |
| [RES-59](https://linear.app/resume-builder-v3/issue/RES-59) | Dark mode dashboard fix | — |
| [RES-58](https://linear.app/resume-builder-v3/issue/RES-58) | Delete resume (backend + frontend) | RES-57 |
| [RES-60](https://linear.app/resume-builder-v3/issue/RES-60) | Name resumes (backend + frontend) | — |
| [RES-55](https://linear.app/resume-builder-v3/issue/RES-55) | Auth page decoration | — |

### Dependency graph
```
RES-57 (ConfirmModal) ──┬── RES-54 (Save + unsaved guard)
                        └── RES-58 (Delete resume)

RES-56 (Resizable preview)   — independent
RES-59 (Dark mode dashboard) — independent
RES-60 (Name resumes)        — independent
RES-55 (Auth page decoration)— independent
```

## Open Questions

- None remaining.
