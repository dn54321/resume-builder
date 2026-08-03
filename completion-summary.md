# RES-54: Save button + unsaved changes guard in builder

## Summary

Added explicit save functionality and unsaved-changes protection to the resume builder.

## Changes

### `frontend/src/features/builder/composables/useResumeData.ts`
- Added `dirty` ref that tracks unsaved store mutations
- Used `flush: 'sync'` on the dirty watcher — this was the critical bug fix from the previous attempt. Without it, Vue's async watcher batching meant the watcher fired AFTER `initialLoadComplete` was set to `true`, causing spurious `dirty=true` right after `loadResume()`.
- `saveResume()` and auto-save both clear `dirty = false` on success

### `frontend/src/features/builder/ResumeBuilder.vue`
- Added "Save Changes" button (visible only when `dirty`) next to PDF export
- `isSaving` ref shows "Saving..." disabled state during save
- "Saved" confirmation text fades out after 2s using CSS opacity transition
- `beforeunload` listener sets `event.returnValue = ''` when dirty (browser close guard)
- `onBeforeRouteLeave` navigation guard shows `ConfirmModal` with async Promise resolution

### `frontend/src/features/builder/components/ConfirmModal.vue` (new)
- Reka UI Dialog-based confirmation modal
- Accepts `title`, `description`, `confirmText`, `cancelText` props
- Emits `confirm`/`cancel` events; supports `v-model` for open state
- Non-dismissible (prevents escape key and outside click)

### Tests
- 44 tests across `ResumeBuilder.spec.ts` and `useResumeData.spec.ts` — all passing
- Full test suite: 430 tests across 35 files — all passing
- Tests cover: save button visibility/state, saved confirmation timing, beforeunload behavior, dirty flag lifecycle, auto-save clears dirty

## Root cause of previous failure

The dirty watcher was using the default async flush mode. During `loadResume()`, `store.initializeDefaults()` triggers watcher callbacks asynchronously. Since `initialLoadComplete = true` is set synchronously right after the mutation, the pending watcher callbacks fire later and see `initialLoadComplete === true`, incorrectly setting `dirty = true`. Fix: `flush: 'sync'` ensures callbacks fire during the mutation while `initialLoadComplete` is still `false`.
