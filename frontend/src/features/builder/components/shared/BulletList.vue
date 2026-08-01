<template>
  <div class="bullet-list">
    <div
      v-for="(bullet, index) in bullets"
      :key="bullet.id"
      class="bullet-list__row"
    >
      <span
        class="bullet-list__drag-handle"
        @mousedown.prevent="onDragStart($event, index)"
        title="Drag to reorder"
      >&#x2630;</span>
      <span class="bullet-list__dot">&bull;</span>
      <input
        type="text"
        :value="bullet.value"
        @input="onUpdate(index, ($event.target as HTMLInputElement).value)"
        class="bullet-list__input"
        :placeholder="placeholder"
      />
      <button
        class="bullet-list__remove-btn"
        @click="onRemove(bullet.id)"
        title="Remove bullet"
        aria-label="Remove bullet point"
      >&times;</button>
    </div>
    <button class="bullet-list__add-btn" @click="$emit('add')">
      + Add bullet point
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

export interface BulletState {
  id: string
  value: string
}

withDefaults(defineProps<{
  bullets: BulletState[]
  placeholder?: string
}>(), {
  placeholder: 'Enter bullet point...',
})

const emit = defineEmits<{
  add: []
  remove: [id: string]
  update: [index: number, value: string]
  reorder: [fromIndex: number, toIndex: number]
}>()

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
    const targetRow = target?.closest('.bullet-list__row') as HTMLElement | null
    if (targetRow) {
      const rows = Array.from(
        targetRow.parentElement!.querySelectorAll('.bullet-list__row'),
      )
      const targetIndex = rows.indexOf(targetRow)
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
 * @param index
 * @param value
 */
function onUpdate(index: number, value: string) {
  emit('update', index, value)
}

/**
 *
 * @param id
 */
function onRemove(id: string) {
  if (window.confirm('Delete this bullet point?')) {
    emit('remove', id)
  }
}
</script>

<style scoped>
.bullet-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.bullet-list__row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.bullet-list__drag-handle {
  cursor: grab;
  color: var(--color-text-muted, #9ca3af);
  font-size: 0.75rem;
  flex-shrink: 0;
}

.bullet-list__drag-handle:active {
  cursor: grabbing;
}

.bullet-list__dot {
  color: var(--color-text-muted, #9ca3af);
  flex-shrink: 0;
}

.bullet-list__input {
  flex: 1;
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.bullet-list__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.bullet-list__remove-btn {
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

.bullet-list__remove-btn:hover {
  background: var(--color-error-bg, #fef2f2);
  color: var(--color-error, #dc2626);
}

.bullet-list__add-btn {
  padding: 0.375rem 0.75rem;
  border: 1px dashed var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  background: transparent;
  color: var(--color-text-muted, #6b7280);
  cursor: pointer;
  font-size: 0.8125rem;
  font-family: inherit;
  align-self: flex-start;
  transition: border-color 0.15s, color 0.15s;
}

.bullet-list__add-btn:hover {
  border-color: var(--color-primary, #3b82f6);
  color: var(--color-primary, #3b82f6);
}
</style>
