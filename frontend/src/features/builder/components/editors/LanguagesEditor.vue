<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-gray-900">Languages</h3>
    <div class="flex flex-col gap-1.5">
      <div
        v-for="(entry, index) in languageEntries"
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
          :value="entry.name"
          @input="onNameUpdate(entry.id, ($event.target as HTMLInputElement).value)"
          class="flex-1 px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          placeholder="e.g. English"
        />
        <select
          :value="entry.proficiency"
          @change="onProficiencyUpdate(entry.id, ($event.target as HTMLSelectElement).value)"
          class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white min-w-[160px] focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
          class="w-6 h-6 flex items-center justify-center border-none bg-transparent text-gray-400 cursor-pointer rounded-sm text-lg leading-none shrink-0 hover:bg-red-50 hover:text-red-600"
          @click="onRemove(entry.id)"
          title="Remove language"
          aria-label="Remove language"
        >&times;</button>
      </div>
    </div>
    <button class="mt-2 px-3 py-1.5 border border-dashed border-gray-300 rounded-sm bg-transparent text-gray-500 cursor-pointer text-[0.8125rem] font-[inherit] transition-colors hover:border-blue-500 hover:text-blue-500" @click="addLanguage">
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


