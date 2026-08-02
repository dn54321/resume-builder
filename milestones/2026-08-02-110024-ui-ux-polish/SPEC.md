# Milestone: UI/UX Polish — Theming, Layout & Usability

**Date:** 2026-08-02 11:00:24 UTC
**Status:** Approved

## Summary

Overhaul the resume builder's visual design with a warm, creative color palette and full light/dark/system theme support. Fix critical usability issues: section toggle data loss, missing full-screen preview, oversized JD footer, broken section reorder, and absent email validation on signup/signin. Replace the one-at-a-time section editor with a scrollable all-sections view so users can see and edit every enabled section at once.

## User Stories

- As a **job seeker**, I want a **visually warm and inviting UI** with a proper color palette and theme toggle, so that the tool feels modern and pleasant to use for extended editing sessions.
- As a **job seeker**, I want to **see all my enabled sections at once** in the editor so I can quickly scan and edit without clicking through each one individually.
- As a **job seeker**, I want **my section data to persist when I toggle a section off and back on**, so I don't lose work when experimenting with what to include.
- As a **job seeker**, I want to **view my resume full-screen** so I can proofread it at actual size before exporting.
- As a **job seeker**, I want the **job description input out of my way** when I'm not using it, so I have more room for the resume preview and editor.
- As a **job seeker**, I want to **reorder sections in the sidebar** to control the sequence they appear on my resume.
- As a **visitor**, I want **clear, immediate feedback when my email is invalid** during signup or login, so I can fix it before submitting.

## Acceptance Criteria

### Theming & Color
- [ ] A warm, creative color palette replaces the current monochrome white/gray scheme across the entire builder
- [ ] Theme toggle (Light / Dark / System) available in the navbar or builder toolbar
- [ ] Theme preference persisted (localStorage) and applied on next visit
- [ ] All builder sub-components respect the active theme (editors, preview, toggles, modals, buttons)
- [ ] Tailwind `dark:` variants used throughout; no hardcoded colors that break dark mode

### All-Sections Editor
- [ ] Center panel shows ALL enabled sections stacked vertically, separated by section headers
- [ ] Each section is collapsible (click header to expand/collapse)
- [ ] Section headers show the section name and a colored indicator dot matching the toggle state
- [ ] Sidebar section click still scrolls to that section in the center panel
- [ ] Clicking a disabled section in the sidebar enables it and scrolls to it

### Toggle Data Persistence
- [ ] Toggling a section OFF hides it from the editor and preview but **retains all entries/fields** in the store
- [ ] Toggling it back ON restores the section with all previous data intact
- [ ] `toggleSection` in the Pinia store uses a soft enable/disable flag instead of removing the section from the array

### Full-Screen Preview
- [ ] A "Full Screen" button in the preview panel header or toolbar
- [ ] Clicking it opens a modal/overlay showing the resume at full size (or as large as the viewport allows)
- [ ] The full-screen view supports both Standard and Two-Column layouts
- [ ] Escape key or close button dismisses the full-screen view

### Job Description Modal
- [ ] The JD textarea and its enclosing footer are removed from the main builder layout
- [ ] A "Job Description" button is added to the toolbar/header area
- [ ] Clicking opens a modal with the textarea for pasting the JD
- [ ] The modal has a "Save" button that stores the JD text and closes the modal
- [ ] The existing "Tailor Resume" button and filter status indicator move to a compact toolbar row (not inside the modal)
- [ ] The Tailor button is disabled with a hint if no JD has been saved

### Section Reorder (Sidebar)
- [ ] Dragging a section's grab handle reorders it among the enabled sections with visual feedback (placeholder/ghost)
- [ ] Uses proper HTML5 drag-and-drop or a robust pointer-event implementation (not the current mousedown/mouseup hack)
- [ ] The preview and editor sections update to reflect the new order immediately
- [ ] Section order is persisted in the resume payload (already supported by backend)

### Email Validation (Signup & Login)
- [ ] SignupView: email input has `type="email"`, with inline client-side format validation on blur
- [ ] LoginView: inline client-side format validation on blur (already has `type="email"`, add regex check)
- [ ] Both views show a specific "Please enter a valid email address" message below the input on invalid format
- [ ] Backend validation errors for email are surfaced with their actual message (not the generic "Something went wrong" fallback)
- [ ] The generic fallback message is replaced with a more helpful message (e.g., "An unexpected error occurred. Please try again.")

## Scope

### In Scope

- **Color palette definition**: A warm, creative palette (e.g., amber/gold primary, warm neutrals, coral/rose accents) defined as Tailwind CSS custom properties or theme extension
- **Theme system**: CSS custom properties for light/dark variants, `dark:` Tailwind variants, theme toggle component
- **Theme toggle UI**: Dropdown or segmented button in navbar (Light / Dark / System)
- **All-sections editor**: Stack enabled sections in center panel with collapsible headers, smooth-scroll from sidebar clicks
- **Toggle persistence**: Refactor `toggleSection` to use a soft flag; update `enabledSections` computed, preview rendering, and payload serialization
- **Full-screen preview modal**: Overlay with scaled or viewport-filling resume, escape-to-close
- **JD modal**: Extracts JD textarea into a modal triggered by a toolbar button; Tailor/filter controls stay in builder UI
- **Section reorder fix**: Replace the broken mousedown/mouseup hack with proper drag-and-drop (HTML5 DnD API or `@vueuse/core` `useDraggable`)
- **Email validation**: Client-side validation on both forms, `type="email"` on SignupView, better error message extraction and fallback
- **Tests**: All new and modified components must maintain ≥90% coverage

### Out of Scope

- New backend API endpoints or schema changes (toggle persistence is a frontend-only store change)
- Additional resume layouts beyond Standard and Two-Column
- Drag-and-drop for entry reordering within sections (EntryList) — only section reorder is fixed in this milestone
- Animations/transitions beyond the scroll-to behavior
- Accessibility audit (though HTML5 DnD is more accessible than the current hack)
- The auth pages (LoginView, SignupView) restyle — they were already restyled in the previous UI Overhaul milestone; this milestone only adds validation
- Any changes to the tailor/LLM matching logic

## Technical Approach

### Color Palette

Define a warm, creative palette using Tailwind CSS v4's `@theme` directive:

```
Primary:     amber/warm gold (#f59e0b range)
Secondary:   warm rose/coral (#f43f5e range)  
Neutral:     warm grays (stone family instead of gray)
Background:  warm off-white in light mode, warm dark slate in dark mode
```

All existing `gray-*`, `blue-*`, `bg-white` classes on builder components are replaced with palette-aware equivalents.

### Theme Architecture

```
frontend/src/
├── shared/
│   └── composables/
│       └── useTheme.ts          # NEW: theme state, toggle, localStorage persistence
└── assets/
    └── main.css                 # UPDATE: add @theme block, CSS custom properties
```

`useTheme` composable:
```ts
type Theme = 'light' | 'dark' | 'system'
```
- Reads initial value from `localStorage('theme')` or defaults to `'system'`
- On system theme: uses `window.matchMedia('(prefers-color-scheme: dark)')`
- Adds/removes `dark` class on `document.documentElement` (Tailwind's `darkMode: 'class'` strategy)
- Theme toggle component in navbar reads/writes via this composable

### Store Changes (`resume.ts`)

```ts
// Add to ResumeSectionState:
interface ResumeSectionState {
  // ... existing fields
  enabled: boolean  // NEW: soft toggle, defaults to true
}

// Refactored toggleSection:
function toggleSection(sectionType: SectionType) {
  const section = sections.value.find(s => s.sectionType === sectionType)
  if (section) {
    section.enabled = !section.enabled  // flip flag, keep data
  }
}

// Updated enabledSections computed:
const enabledSections = computed(() =>
  sections.value.filter(s => s.enabled).map(s => s.sectionType)
)

// Updated toPayload: include enabled flag
// Updated loadFromPayload: restore enabled flag
```

### Section Reorder (HTML5 DnD)

Replace the `SectionToggles.vue` mousedown/mouseup hack with HTML5 drag-and-drop:

```html
<li
  v-for="section in orderedSections"
  draggable="true"
  @dragstart="onDragStart($event, section.type)"
  @dragover.prevent="onDragOver($event, section.type)"
  @drop="onDrop($event, section.type)"
  @dragend="onDragEnd"
>
```

- `dragstart`: set `dataTransfer` with section type, add `opacity-50` class
- `dragover`: determine drop position (above/below), show insertion indicator
- `drop`: emit `reorder` with new order
- `dragend`: clean up classes

### Full-Screen Preview Modal

- New component: `FullscreenPreview.vue` (or extend `LivePreview.vue` with a prop)
- Renders the same `StandardLayout`/`TwoColumnLayout` but at the largest scale that fits the viewport
- Wrapped in a modal/dialog (shadcn-vue `Dialog` component already available)
- Opened via button in the preview panel header

### JD Modal

- New component: `JdModal.vue` wrapping shadcn-vue `Dialog`
- Triggered by a "Job Description" button in the builder toolbar
- Contains the textarea (moved from `JdInput.vue`)
- Save button writes to `store.jdText` and closes modal
- The existing Tailor/Reset buttons and filter status indicator move to a compact bar in the builder header area

### Builder Layout Changes

Before:
```
┌──────────────────────────────────────────────┐
│ Header (PdfExportButton)                     │
├────────┬──────────────────┬──────────────────┤
│ Sidebar│ SectionEditor    │ LivePreview      │
│ 260px  │ (one at a time)  │ 300px            │
├────────┴──────────────────┴──────────────────┤
│ Footer: JdInput (max 35vh)                   │
└──────────────────────────────────────────────┘
```

After:
```
┌──────────────────────────────────────────────┐
│ Toolbar: [JD btn] [Tailor btn] [Reset] [PDF] │
│ [Filter status indicator]                    │
├────────┬──────────────────┬──────────────────┤
│ Sidebar│ AllSectionsEditor│ LivePreview      │
│ 260px  │ (stacked,        │ 300px            │
│        │  collapsible)    │ [Fullscreen btn] │
└────────┴──────────────────┴──────────────────┘
```

The left sidebar width stays at 260px, right preview at 300px. The center panel is now substantially more useful with all sections visible.

### API Endpoints

No changes. All fixes are frontend-only.

### Database Schema

No changes.

## Dependencies

- **UI Overhaul milestone** (2026-08-02-004505-ui-overhaul): Must be complete. This milestone builds on the Tailwind + shadcn-vue foundation and builder restyle.
- **Resume Builder milestone** (2026-07-31-152550-resume-builder): Must be complete. Core builder functionality.

## Open Questions

- Exact color palette values — should be finalized during implementation with visual review. The spec defines the direction (warm, creative) but exact hex values are TBD.
- Should the full-screen preview show the resume at print scale (100%) with scrolling, or scale-to-fit the viewport?
