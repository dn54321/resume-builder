<template>
  <div class="languages-editor">
    <h3 class="languages-editor__title">Languages</h3>
    <div class="languages-editor__list">
      <div
        v-for="(entry, index) in languageEntries"
        :key="entry.id"
        class="languages-editor__row"
      >
        <span
          class="languages-editor__drag-handle"
          @mousedown.prevent="onDragStart($event, index)"
          title="Drag to reorder"
        >&#x2630;</span>
        <input
          type="text"
          :value="entry.name"
          @input="onNameUpdate(entry.id, ($event.target as HTMLInputElement).value)"
          class="languages-editor__input"
          placeholder="e.g. English"
        />
        <select
          :value="entry.proficiency"
          @change="onProficiencyUpdate(entry.id, ($event.target as HTMLSelectElement).value)"
          class="languages-editor__select"
          aria-label="Proficiency level"
        >
          <option value="">Select proficiency...</option>
          <option value="Elementary">Elementary</option>
          <option value="Limited Working">Limited Working</option>
          <option value="Professional Working">Professional Working</option>
          <option value="Full Professional">Full Professional</option>
          <option value="Native">Native</option>
          <option value="Bilingual">Bilingual</option>
        </select>
        <button
          class="languages-editor__remove-btn"
          @click="onRemove(entry.id)"
          title="Remove language"
          aria-label="Remove language"
        >&times;</button>
      </div>
    </div>
    <button class="languages-editor__add-btn" @click="addLanguage">
      + Add Language
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'

const editor = useSectionEditor('languages')
const dragIndex = ref<number | null>(null)

interface LanguageRow {
  id: string
  name: string
  proficiency: string
}

const languageEntries = computed<LanguageRow[]>(() =>
  editor.entries.value
    .filter((e) => !e.parentId)
    .sort((a, b) => a.order - b.order)
    .map((e) => ({
      id: e.id,
      name: editor.getFieldValue(e.id, 'name'),
      proficiency: editor.getFieldValue(e.id, 'proficiency'),
    })),
)

/**
 *
 */
function addLanguage() {
  editor.addEntry([
    { key: 'name', value: '' },
    { key: 'proficiency', value: '' },
  ])
}

/**
 *
 * @param id
 * @param value
 */
function onNameUpdate(id: string, value: string) {
  editor.updateField(id, 'name', value)
}

/**
 *
 * @param id
 * @param value
 */
function onProficiencyUpdate(id: string, value: string) {
  editor.updateField(id, 'proficiency', value)
}

/**
 *
 * @param id
 */
function onRemove(id: string) {
  if (window.confirm('Delete this language?')) {
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
    const targetRow = target?.closest('.languages-editor__row') as HTMLElement | null
    if (targetRow) {
      const rows = Array.from(
        targetRow.parentElement!.querySelectorAll('.languages-editor__row'),
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
.languages-editor {
  padding: 1rem;
}

.languages-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.languages-editor__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.languages-editor__row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.languages-editor__drag-handle {
  cursor: grab;
  color: var(--color-text-muted, #9ca3af);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.languages-editor__drag-handle:active {
  cursor: grabbing;
}

.languages-editor__input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.languages-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.languages-editor__select {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
  min-width: 160px;
}

.languages-editor__select:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.languages-editor__remove-btn {
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

.languages-editor__remove-btn:hover {
  background: var(--color-error-bg, #fef2f2);
  color: var(--color-error, #dc2626);
}

.languages-editor__add-btn {
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

.languages-editor__add-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
</style>
