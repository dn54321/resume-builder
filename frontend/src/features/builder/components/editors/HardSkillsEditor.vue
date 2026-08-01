<template>
  <div class="skills-editor">
    <h3 class="skills-editor__title">Hard Skills</h3>
    <div class="skills-editor__list">
      <div
        v-for="(entry, index) in skillEntries"
        :key="entry.id"
        class="skills-editor__row"
      >
        <span
          class="skills-editor__drag-handle"
          @mousedown.prevent="onDragStart($event, index)"
          title="Drag to reorder"
        >&#x2630;</span>
        <input
          type="text"
          :value="entry.value"
          @input="onUpdate(entry.id, ($event.target as HTMLInputElement).value)"
          class="skills-editor__input"
          placeholder="e.g. TypeScript"
        />
        <button
          class="skills-editor__remove-btn"
          @click="onRemove(entry.id)"
          title="Remove skill"
          aria-label="Remove skill"
        >&times;</button>
      </div>
    </div>
    <button class="skills-editor__add-btn" @click="addSkill">
      + Add Skill
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'

const editor = useSectionEditor('hard_skills')
const dragIndex = ref<number | null>(null)

interface SkillRow {
  id: string
  value: string
}

const skillEntries = computed<SkillRow[]>(() =>
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
function addSkill() {
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
  if (window.confirm('Delete this skill?')) {
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
    const targetRow = target?.closest('.skills-editor__row') as HTMLElement | null
    if (targetRow) {
      const rows = Array.from(
        targetRow.parentElement!.querySelectorAll('.skills-editor__row'),
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
.skills-editor {
  padding: 1rem;
}

.skills-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.skills-editor__list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.skills-editor__row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.skills-editor__drag-handle {
  cursor: grab;
  color: var(--color-text-muted, #9ca3af);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.skills-editor__drag-handle:active {
  cursor: grabbing;
}

.skills-editor__input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.skills-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.skills-editor__remove-btn {
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

.skills-editor__remove-btn:hover {
  background: var(--color-error-bg, #fef2f2);
  color: var(--color-error, #dc2626);
}

.skills-editor__add-btn {
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

.skills-editor__add-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
</style>
