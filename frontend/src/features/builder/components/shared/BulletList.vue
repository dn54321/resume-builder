<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-for="(bullet, index) in bullets"
      :key="bullet.id"
      data-drag-row="bullet"
      class="flex items-center gap-1.5 transition-opacity"
      :class="{ 'opacity-45': bullet.dimmed }"
    >
      <!-- Drag handle — mouse-driven reorder is inherently mouse-only;
           the grab handle is non-interactive for keyboard users but
           announces its purpose via aria-label. -->
      <span
        class="cursor-grab text-muted-foreground/70 text-xs shrink-0 active:cursor-grabbing"
        @mousedown.prevent="onDragStart($event, index)"
        title="Drag to reorder"
        role="button"
        tabindex="0"
        aria-label="Drag to reorder bullet"
      >&#x2630;</span>
      <!-- eslint-enable vuejs-accessibility/no-static-element-interactions -->
      <slot name="bullet" :bullet="bullet" :index="index" />
      <span class="text-muted-foreground/70 shrink-0">&bull;</span>
      <input
        type="text"
        :value="bullet.value"
        @input="onUpdate(index, ($event.target as HTMLInputElement).value)"
        class="flex-1 px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
        :class="bullet.dimmed ? 'text-muted-foreground/70' : 'text-foreground'"
        :placeholder="placeholder"
        :aria-label="`Bullet point ${index + 1}`"
      />
      <!-- Bullet visibility toggle (RES-106): eye shows the bullet in the resume,
           eye crossed out hides it. Lives on the bullet row for Experience/Projects. -->
      <button
        type="button"
        class="w-6 h-6 flex items-center justify-center border-none bg-transparent rounded-sm text-xs shrink-0 transition-colors hover:bg-muted/50 hover:text-foreground"
        :class="bullet.visible === false ? 'text-muted-foreground/50' : 'text-foreground'"
        :title="bullet.visible === false ? 'Show bullet in resume' : 'Hide bullet from resume'"
        :aria-label="`${bullet.visible === false ? 'Show' : 'Hide'} bullet point`"
        :aria-pressed="bullet.visible !== false"
        data-testid="bullet-eye-toggle"
        @click="emit('toggleVisibility', bullet.id)"
      >
        <Eye v-if="bullet.visible !== false" class="w-3.5 h-3.5" />
        <EyeOff v-else class="w-3.5 h-3.5" />
      </button>
      <!-- Bullet lock toggle (RES-106): protect this bullet from Tailor edits. -->
      <button
        type="button"
        class="w-6 h-6 flex items-center justify-center border-none bg-transparent rounded-sm text-xs shrink-0 transition-colors hover:bg-muted/50 hover:text-foreground"
        :class="bullet.locked ? 'text-muted-foreground/50' : 'text-foreground'"
        :title="bullet.locked ? 'Unlock bullet (Tailor may edit it)' : 'Lock bullet (protect from Tailor)'"
        :aria-label="`${bullet.locked ? 'Unlock' : 'Lock'} bullet point`"
        :aria-pressed="bullet.locked"
        data-testid="bullet-lock-toggle"
        @click="emit('toggleLock', bullet.id)"
      >
        <Lock v-if="bullet.locked" class="w-3.5 h-3.5" />
        <LockOpen v-else class="w-3.5 h-3.5" />
      </button>
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
import { Eye, EyeOff, Lock, LockOpen } from '@lucide/vue'

export interface BulletState {
  id: string
  value: string
  /** When true, the bullet row is dimmed (filtered out) */
  dimmed?: boolean
  /** Whether the bullet is Tailor-protected (eye/lock on bullet rows, RES-106) */
  locked?: boolean
  /** Whether the bullet is visible in the rendered resume (eye toggle, RES-106) */
  visible?: boolean
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
  toggleLock: [id: string]
  toggleVisibility: [id: string]
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


