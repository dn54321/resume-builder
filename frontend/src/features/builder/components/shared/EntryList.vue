<template>
  <div class="flex flex-col gap-2">
    <div
      v-for="(entry, index) in entries"
      :key="entry.id"
      class="border border-border rounded-md overflow-hidden"
      data-entry-panel
    >
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions, vuejs-accessibility/click-events-have-key-events -->
      <div
        class="flex items-center gap-2 px-3 py-2 bg-muted/20 cursor-pointer select-none hover:bg-muted/50"
        role="button"
        tabindex="0"
        :aria-expanded="isExpanded(entry.id)"
        :aria-label="`Toggle ${entryTitle(entry, index)}`"
        @click="toggleEntry(entry.id)"
        @keydown.enter.prevent="toggleEntry(entry.id)"
        @keydown.space.prevent="toggleEntry(entry.id)"
      >
        <!-- Drag handle — mouse-only; announces purpose via aria-label -->
        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
        <span
          class="cursor-grab text-muted-foreground/70 text-sm p-0.5 shrink-0 active:cursor-grabbing"
          @mousedown.prevent="onDragStart($event, index)"
          title="Drag to reorder"
          role="button"
          tabindex="0"
          aria-label="Drag to reorder entry"
        >&#x2630;</span>
        <span class="flex-1 text-[0.8125rem] font-medium text-foreground overflow-hidden text-ellipsis whitespace-nowrap">{{ entryTitle(entry, index) }}</span>
        <button
          class="w-6 h-6 flex items-center justify-center border-none bg-transparent text-muted-foreground/70 cursor-pointer rounded-sm text-lg leading-none shrink-0 hover:bg-destructive/10 hover:text-destructive"
          @click.stop="onRemove(entry.id)"
          title="Remove entry"
          aria-label="Remove entry"
        >&times;</button>
        <span class="text-[0.625rem] text-muted-foreground/70 shrink-0">{{ isExpanded(entry.id) ? '&#x25B2;' : '&#x25BC;' }}</span>
      </div>
      <div v-if="isExpanded(entry.id)" class="p-3 border-t border-border flex flex-col gap-2.5">
        <slot name="fields" :entry="entry" :index="index" />
      </div>
    </div>
    <button class="px-4 py-2 border border-dashed border-border rounded-md bg-transparent text-muted-foreground cursor-pointer text-[0.8125rem] font-[inherit] transition-colors hover:border-primary hover:text-primary" @click="$emit('add')">
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
    // Find the closest entry panel (div with border, rounded-md, overflow-hidden)
    const targetPanel = target?.closest('[data-entry-panel]') as HTMLElement | null
    if (targetPanel && targetPanel.parentElement) {
      const panels = Array.from(
        targetPanel.parentElement.querySelectorAll('[data-entry-panel]'),
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


