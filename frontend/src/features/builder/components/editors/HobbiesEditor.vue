<template>
  <div class="hobbies-editor">
    <h3 class="hobbies-editor__title">Hobbies</h3>
    <div class="hobbies-editor__list">
      <div
        v-for="(entry, index) in hobbyEntries"
        :key="entry.id"
        class="hobbies-editor__row"
      >
        <span
          class="hobbies-editor__drag-handle"
          @mousedown.prevent="onDragStart($event, index)"
          title="Drag to reorder"
        >&#x2630;</span>
        <input
          type="text"
          :value="entry.value"
          @input="onUpdate(entry.id, ($event.target as HTMLInputElement).value)"
          class="hobbies-editor__input"
          placeholder="e.g. Photography"
        />
        <button
          class="hobbies-editor__remove-btn"
          @click="onRemove(entry.id)"
          title="Remove hobby"
          aria-label="Remove hobby"
        >&times;</button>
      </div>
    </div>
    <button class="hobbies-editor__add-btn" @click="addHobby">
      + Add Hobby
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'

const editor = useSectionEditor('hobbies')
const dragIndex = ref<number | null>(null)

interface HobbyRow {
  id: string
  value: string
}

const hobbyEntries = computed<HobbyRow[]>(() =>
  editor.entries.value
    .filter((e) => !e.parentId)
    .sort((a, b) => a.order - b.order)
    .map((e) => ({
      id: e.id,
      value: editor.getFieldValue(e.id, 'name'),
    })),
)

/**
 *
 */
function addHobby() {
  editor.addEntry([{ key: 'name', value: '' }])
}

/**
 *
 * @param id
 * @param value
 */
function onUpdate(id: string, value: string) {
  editor.updateField(id, 'name', value)
}

/**
 *
 * @param id
 */
function onRemove(id: string) {
  if (window.confirm('Delete this hobby?')) {
    editor.removeEntry(id)
  }
}

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
    const targetRow = target?.closest('.hobbies-editor__row') as HTMLElement | null
    if (targetRow) {
      const rows = Array.from(
        targetRow.parentElement!.querySelectorAll('.hobbies-editor__row'),
      )
      const targetIndex = rows.indexOf(targetRow)
      if (targetIndex !== -1 && targetIndex !== dragIndex.value) {
        editor.reorderEntries(dragIndex.value, targetIndex)
      }
    }
    dragIndex.value = null
  }

  document.addEventListener('mouseup', onMouseUp)
}
</script>

<style scoped>
.hobbies-editor {
  padding: 1rem;
}

.hobbies-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.hobbies-editor__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.hobbies-editor__row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.hobbies-editor__drag-handle {
  cursor: grab;
  color: var(--color-text-muted, #9ca3af);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.hobbies-editor__drag-handle:active {
  cursor: grabbing;
}

.hobbies-editor__input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.hobbies-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.hobbies-editor__remove-btn {
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

.hobbies-editor__remove-btn:hover {
  background: var(--color-error-bg, #fef2f2);
  color: var(--color-error, #dc2626);
}

.hobbies-editor__add-btn {
  margin-top: 0.5rem;
  padding: 0.375rem 0.75rem;
  border: 1px dashed var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  font-size: 0.8125rem;
  font-family: inherit;
  transition: border-color 0.15s, color 0.15s;
}

.hobbies-editor__add-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
</style>
