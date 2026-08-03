<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-foreground">
      Hard Skills
      <span
        v-if="store.isFiltered"
        class="font-normal text-xs text-muted-foreground"
      >
        &mdash; Showing {{ visibleCount }} of {{ totalCount }} skills
      </span>
    </h3>
    <div class="flex flex-col gap-1.5">
      <div
        v-for="(entry, index) in skillEntries"
        :key="entry.id"
        data-drag-row="skill"
        class="flex items-center gap-1.5 transition-opacity"
        :class="{ 'opacity-45': entry.dimmed }"
      >
        <span
          class="cursor-grab text-muted-foreground/70 text-xs shrink-0 active:cursor-grabbing"
          @mousedown.prevent="onDragStart($event, index)"
          title="Drag to reorder"
        >&#x2630;</span>
        <span
          v-if="store.isFiltered"
          class="text-[0.6875rem] shrink-0 w-4 text-center cursor-default"
          :class="entry.dimmed ? 'text-muted-foreground/40' : 'text-green-600'"
          :title="entry.dimmed ? 'Filtered out' : 'Relevant'"
        >
          {{ entry.dimmed ? '&#10005;' : '&#10003;' }}
        </span>
        <input
          type="text"
          :value="entry.value"
          @input="onUpdate(entry.id, ($event.target as HTMLInputElement).value)"
          class="flex-1 px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
          :class="entry.dimmed ? 'text-muted-foreground/70' : 'text-foreground'"
          placeholder="e.g. TypeScript"
        />
        <button
          class="w-6 h-6 flex items-center justify-center border-none bg-transparent text-muted-foreground/70 cursor-pointer rounded-sm text-lg leading-none shrink-0 hover:bg-destructive/10 hover:text-destructive"
          @click="onRemove(entry.id)"
          title="Remove skill"
          aria-label="Remove skill"
        >&times;</button>
      </div>
    </div>
    <button class="mt-2 px-3 py-1.5 border border-dashed border-border rounded-sm bg-transparent text-muted-foreground cursor-pointer text-[0.8125rem] font-[inherit] transition-colors hover:border-primary hover:text-primary" @click="addSkill">
      + Add Skill
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'

const editor = useSectionEditor('hard_skills')
const store = useResumeStore()
const dragIndex = ref<number | null>(null)

interface SkillRow {
  id: string
  value: string
  dimmed: boolean
}

const skillEntries = computed<SkillRow[]>(() =>
  editor.entries.value
    .filter((e) => !e.parentId)
    .sort((a, b) => a.order - b.order)
    .map((e) => {
      const value = editor.getFieldValue(e.id, 'name')
      return {
        id: e.id,
        value,
        dimmed: store.isFiltered && !store.isSkillRelevant('hard_skills', value),
      }
    }),
)

const totalCount = computed(() => skillEntries.value.length)
const visibleCount = computed(() =>
  store.isFiltered
    ? skillEntries.value.filter((s) => !s.dimmed).length
    : totalCount.value,
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
    const targetRow = target?.closest('[data-drag-row="skill"]') as HTMLElement | null
    if (targetRow) {
      const rows = Array.from(
        targetRow.parentElement!.querySelectorAll('[data-drag-row="skill"]'),
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


