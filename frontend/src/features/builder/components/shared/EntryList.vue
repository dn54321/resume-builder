<template>
  <div class="entry-list">
    <div
      v-for="(entry, index) in entries"
      :key="entry.id"
      class="entry-list__panel"
      :class="{ 'entry-list__panel--expanded': isExpanded(entry.id) }"
    >
      <div class="entry-list__header" @click="toggleEntry(entry.id)">
        <span
          class="entry-list__drag-handle"
          @mousedown.prevent="onDragStart($event, index)"
          title="Drag to reorder"
        >&#x2630;</span>
        <span class="entry-list__title">{{ entryTitle(entry, index) }}</span>
        <button
          class="entry-list__remove-btn"
          @click.stop="onRemove(entry.id)"
          title="Remove entry"
          aria-label="Remove entry"
        >&times;</button>
        <span class="entry-list__collapse-icon">{{ isExpanded(entry.id) ? '&#x25B2;' : '&#x25BC;' }}</span>
      </div>
      <div v-if="isExpanded(entry.id)" class="entry-list__body">
        <slot name="fields" :entry="entry" :index="index" />
      </div>
    </div>
    <button class="entry-list__add-btn" @click="$emit('add')">
      + {{ addLabel }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

interface EntryLike {
  id: string
  order: number
}

const props = defineProps<{
  entries: EntryLike[]
  addLabel: string
  entryTitle: (entry: EntryLike, index: number) => string
}>()

const emit = defineEmits<{
  add: []
  remove: [id: string]
  reorder: [fromIndex: number, toIndex: number]
}>()

const expandedIds = ref<Set<string>>(new Set())

// Auto-expand the last entry when a new entry is added
watch(
  () => props.entries.length,
  (newLen, oldLen) => {
    if (newLen > oldLen && props.entries.length > 0) {
      const lastEntry = props.entries[props.entries.length - 1]
      if (lastEntry) {
        expandedIds.value.add(lastEntry.id)
      }
    }
  },
)

/**
 *
 * @param id
 */
function isExpanded(id: string): boolean {
  return expandedIds.value.has(id)
}

/**
 *
 * @param id
 */
function toggleEntry(id: string) {
  const next = new Set(expandedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  expandedIds.value = next
}

const dragIndex = ref<number | null>(null)

/**
 *
 * @param event
 * @param index
 */
function onDragStart(event: MouseEvent, index: number) {
  dragIndex.value = index

  /**
   *
   * @param e
   */
  function onMouseUp(e: MouseEvent) {
    document.removeEventListener('mouseup', onMouseUp)
    if (dragIndex.value === null) return

    const target = document.elementFromPoint(e.clientX, e.clientY)
    const targetPanel = target?.closest('.entry-list__panel') as HTMLElement | null
    if (targetPanel) {
      const panels = Array.from(
        targetPanel.parentElement!.querySelectorAll('.entry-list__panel'),
      )
      const targetIndex = panels.indexOf(targetPanel)
      if (targetIndex !== -1 && targetIndex !== dragIndex.value) {
        emit('reorder', dragIndex.value, targetIndex)
      }
    }
    dragIndex.value = null
  }

  document.addEventListener('mouseup', onMouseUp)
}

/**
 *
 * @param id
 */
function onRemove(id: string) {
  if (window.confirm('Are you sure you want to delete this entry?')) {
    emit('remove', id)
  }
}
</script>

<style scoped>
.entry-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.entry-list__panel {
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  overflow: hidden;
}

.entry-list__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--color-background-soft, #f9fafb);
  cursor: pointer;
  user-select: none;
}

.entry-list__header:hover {
  background: var(--color-background-muted, #e5e7eb);
}

.entry-list__drag-handle {
  cursor: grab;
  color: var(--color-text-muted, #9ca3af);
  font-size: 0.875rem;
  padding: 0.125rem;
  flex-shrink: 0;
}

.entry-list__drag-handle:active {
  cursor: grabbing;
}

.entry-list__title {
  flex: 1;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry-list__remove-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-muted, #9ca3af);
  cursor: pointer;
  border-radius: 0.25rem;
  font-size: 1.125rem;
  line-height: 1;
  flex-shrink: 0;
}

.entry-list__remove-btn:hover {
  background: var(--color-error-bg, #fef2f2);
  color: var(--color-error, #dc2626);
}

.entry-list__collapse-icon {
  font-size: 0.625rem;
  color: var(--color-text-muted, #9ca3af);
  flex-shrink: 0;
}

.entry-list__body {
  padding: 0.75rem;
  border-top: 1px solid var(--color-border, #d1d5db);
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.entry-list__add-btn {
  padding: 0.5rem 1rem;
  border: 1px dashed var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  font-size: 0.8125rem;
  font-family: inherit;
  transition: border-color 0.15s, color 0.15s;
}

.entry-list__add-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
</style>
