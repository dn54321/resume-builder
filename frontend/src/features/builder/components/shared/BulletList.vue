<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-for="(bullet, index) in bullets"
      :key="bullet.id"
      data-drag-row="bullet"
      class="flex items-center gap-1.5 transition-opacity"
      :class="{ 'opacity-45': bullet.dimmed }"
    >
      <span
        class="cursor-grab text-muted-foreground/70 text-xs shrink-0 active:cursor-grabbing"
        @mousedown.prevent="onDragStart($event, index)"
        title="Drag to reorder"
      >&#x2630;</span>
      <slot name="bullet" :bullet="bullet" :index="index" />
      <span class="text-muted-foreground/70 shrink-0">&bull;</span>
      <input
        type="text"
        :value="bullet.value"
        @input="onUpdate(index, ($event.target as HTMLInputElement).value)"
        class="flex-1 px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
        :class="bullet.dimmed ? 'text-muted-foreground/70' : 'text-foreground'"
        :placeholder="placeholder"
      />
      <button
        class="w-6 h-6 flex items-center justify-center border-none bg-transparent text-muted-foreground/70 cursor-pointer rounded-sm text-lg leading-none shrink-0 hover:bg-destructive/10 hover:text-destructive"
        @click="onRemove(bullet.id)"
        title="Remove bullet"
        aria-label="Remove bullet point"
      >&times;</button>
    </div>
    <button class="px-3 py-1.5 border border-dashed border-border rounded-sm bg-transparent text-muted-foreground cursor-pointer text-[0.8125rem] font-[inherit] self-start transition-colors hover:border-primary hover:text-primary" @click="$emit('add')">
      + Add bullet point
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

export interface BulletState {
  id: string
  value: string
  /** When true, the bullet row is dimmed (filtered out) */
  dimmed?: boolean
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
    const targetRow = target?.closest('[data-drag-row="bullet"]') as HTMLElement | null
    if (targetRow) {
      const rows = Array.from(
        targetRow.parentElement!.querySelectorAll('[data-drag-row="bullet"]'),
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


