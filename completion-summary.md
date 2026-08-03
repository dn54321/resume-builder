# RES-45: Replace section editor with all-sections stacked view

## Summary

Replaced the one-at-a-time section editor with a scrollable stacked view showing all enabled sections at once. Each section has a collapsible header with color accent matching the sidebar. Clicking a section in the sidebar smooth-scrolls to it; clicking a disabled section enables it and scrolls to it.

## Changes

### 1. SectionEditor.vue (from RES-48, merged to master)
- Renders ALL enabled sections stacked vertically instead of a single editor
- Each section has a colored header (`border-l-4 border-blue-500 bg-blue-50`) with section name and collapse/expand chevron
- Collapse state persisted in local `ref<Set<SectionType>>` — start all expanded
- `setSectionRef` map populates via `:ref` function binding
- Watches `selectedSectionId` → calls `scrollIntoView({ behavior: 'smooth', block: 'start' })`
- Lazy-loaded editors via `defineAsyncComponent` preserved

### 2. SectionToggles.vue (commit b99d91d)
- Clicking a disabled section label now emits `toggle` then `select` (enables + scrolls to it)
- Clicking an enabled section label emits `select` only (no toggle)

### 3. ResumeBuilder.vue
- No structural changes needed — `selectedSectionId` binding unchanged
- Center panel content is the new stacked all-sections view

## Acceptance Criteria

- [x] Center panel shows ALL enabled sections stacked vertically
- [x] Each section has a colored header with section name and collapse/expand toggle
- [x] Sections are collapsible — clicking header toggles visibility
- [x] Clicking an enabled section in the sidebar smooth-scrolls the center panel to that section
- [x] Clicking a disabled section in the sidebar enables it and smooth-scrolls to it
- [x] All existing editor tests adapted for the new layout (13 tests in SectionEditor.spec.ts)
- [x] ≥90% coverage maintained (93.84% statements, 91.44% branches, 95.06% functions, 93.82% lines)

## Test Results

- 35 test files, 416 tests — all pass
- SectionEditor.spec.ts: 13 tests (rendering, collapse/expand, scroll-to)
- SectionToggles.spec.ts: 31 tests (including disabled-section enable+select test)
- Coverage: 93.84% statements / 91.44% branches / 95.06% functions / 93.82% lines
