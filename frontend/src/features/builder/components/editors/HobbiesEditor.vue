<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-gray-900">Hobbies</h3>
    <div class="flex flex-col gap-1.5">
      <div
        v-for="(entry, index) in hobbyEntries"
        :key="entry.id"
        class="flex items-center gap-1.5"
      >
        <span
          class="cursor-grab text-gray-400 text-xs shrink-0 active:cursor-grabbing"
          @mousedown.prevent="onDragStart($event, index)"
          title="Drag to reorder"
        >&#x2630;</span>
        <input
          type="text"
          :value="entry.value"
          @input="onUpdate(entry.id, ($event.target as HTMLInputElement).value)"
          class="flex-1 px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. Photography"
        />
        <button
          class="w-6 h-6 flex items-center justify-center border-none bg-transparent text-gray-400 cursor-pointer rounded-sm text-lg leading-none shrink-0 hover:bg-red-50 hover:text-red-600"
          @click="onRemove(entry.id)"
          title="Remove hobby"
          aria-label="Remove hobby"
        >&times;</button>
      </div>
    </div>
    <button class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 rounded-sm bg-transparent text-gray-500 cursor-pointer text-[0.8125rem] font-[inherit] transition-colors hover:border-blue-500 hover:text-blue-500" @click="addHobby">
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


