# RES-48: Fix section toggle data persistence

## Summary

The implementation was already completed in commit `05aeba4` and subsequently refined in commits `62b74b6`, `ecad4af`, and `1bea7e1`. All acceptance criteria are met.

## What was implemented

### 1. types/resume.ts — Added `enabled` flag to `ResumeSectionState` and `ResumePayload`

- `ResumeSectionState.enabled: boolean` — defaults to `true` in `createDefaultSection`
- `ResumePayload.sections[].enabled?: boolean` — optional for backward compatibility

### 2. stores/resume.ts — Soft-toggle refactor

- `createDefaultSection` includes `enabled: true`
- `toggleSection` flips `section.enabled` without removing from the array — all 10 section types always stay in `sections`
- `enabledSections` computed filters `s.enabled` instead of mapping all sections
- `initializeDefaults` creates all sections with `enabled: true`
- `toPayload` includes `enabled` in serialized output
- `loadFromPayload` restores `enabled` with `?? true` fallback for backward compat
- `reorderSections` only reorders enabled sections; disabled sections are appended at the end preserving their relative order
- `orderedSectionTypes` computed returns enabled sections first in drag-and-drop order, then disabled sections at the end
- `isSectionEnabled` returns `false` for missing sections (previously returned `true` if the section existed in the array)

### 3. SectionToggles.vue — No structural changes needed

- Already emits `toggle` on checkbox change; the new store logic handles the soft-toggle
- Sidebar now shows all sections (enabled first, disabled at end with `opacity-55`)

### 4. Preview components — Filter disabled sections

- `StandardLayout.vue`: `nonEmptySections` filters `s.enabled !== false`
- `TwoColumnLayout.vue`: `nonEmptySections` filters `s.enabled !== false`
- Disabled sections are hidden from the preview

### 5. SectionEditor.vue — Filters to enabled-only

- `enabledSectionTypes` filters `store.sections` by `s.enabled`

## Verification

- **All 416 tests pass** across 35 test files
- **Coverage: 93.84% statements, 91.44% branches, 95.06% functions, 93.82% lines** — all above 90% threshold
- Tests cover:
  - Toggle off preserves entries (resumeStore.spec.ts)
  - Toggle on restores data (resumeStore.spec.ts)
  - Serialization round-trip with `enabled` flag (resumeStore.spec.ts)
  - Backward compatibility without `enabled` field (resumeStore.spec.ts)
  - Reorder with disabled sections at end (resumeStore.spec.ts)
  - Preview hides disabled sections (StandardLayout.spec.ts, TwoColumnLayout.spec.ts)
  - Preview shows section again when re-enabled (StandardLayout.spec.ts, TwoColumnLayout.spec.ts)
  - LocalStorage round-trip preserves toggle state (useResumeData.spec.ts)
  - SectionEditor still accessible when disabled (useSectionEditor.spec.ts)
  - Sidebar DnD only works with enabled sections (SectionToggles.spec.ts)

## Acceptance Criteria

- [x] Toggling a section OFF hides it from editor and preview but keeps all entries/fields
- [x] Toggling it back ON restores the section with all previous data visible
- [x] Refreshing the page (localStorage/anonymous) preserves toggle state
- [x] Saving to backend (authenticated) preserves toggle state
- [x] Reorder only affects enabled sections; disabled sections stay at the end
- [x] All existing tests pass with updated store logic
- [x] ≥90% coverage maintained
