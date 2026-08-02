<template>
  <div class="mb-6">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-500 m-0 mb-3">Sections</h3>
    <ul class="list-none p-0 m-0 flex flex-col gap-2">
      <li
        v-for="section in orderedSections"
        :key="section.type"
        class="flex items-center gap-2 p-2 rounded-md bg-gray-50 cursor-default transition-opacity"
        :class="{ 'opacity-55': !section.enabled }"
      >
        <label class="flex items-center gap-2 flex-1 cursor-pointer" @click.stop="onLabelClick(section)">
          <input
            type="checkbox"
            :checked="section.enabled"
            @change="emit('toggle', section.type)"
            class="peer absolute opacity-0 w-0 h-0"
          />
          <span class="relative w-9 h-5 bg-gray-300 rounded-[10px] shrink-0 transition-colors peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4"></span>
          <span
            class="text-[0.8125rem] cursor-pointer"
            :class="section.type === selectedSectionId ? 'font-semibold text-blue-500' : section.enabled ? 'text-gray-900' : 'text-gray-400'"
          >{{ section.label }}</span>
        </label>

        <select
          v-if="layout === 'column2-1' && section.enabled"
          :value="section.column"
          @change="emit('setColumn', section.type, ($event.target as HTMLSelectElement).value as 'left' | 'right')"
          class="text-xs py-1 px-2 border border-gray-300 rounded-sm bg-white text-gray-900 font-[inherit]"
          aria-label="Column assignment for {{ section.label }}"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>

        <button
          v-if="section.enabled"
          class="w-7 h-7 flex items-center justify-center border-none bg-transparent text-gray-400 cursor-grab rounded-sm text-sm hover:bg-gray-200 hover:text-gray-900 active:cursor-grabbing"
          title="Drag to reorder"
          @mousedown.prevent="onDragStart($event, section.type)"
          aria-label="Reorder {{ section.label }}"
        >
          &#x2630;
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  SECTION_TYPES,
  SECTION_LABELS,
  type SectionType,
  type LayoutType,
} from '@/features/builder/types/resume'

const props = defineProps<{
  layout: LayoutType
  enabledSections: SectionType[]
  columnAssignments: Record<SectionType, 'left' | 'right'>
  selectedSectionId?: string | null
}>()

const emit = defineEmits<{
  toggle: [sectionType: SectionType]
  setColumn: [sectionType: SectionType, column: 'left' | 'right']
  reorder: [orderedTypes: SectionType[]]
  select: [sectionType: SectionType]
}>()

const dragType = ref<SectionType | null>(null)

/**
 * Handle label click: for disabled sections, toggle first then select.
 * For enabled sections, just select (scroll to).
 * @param section
 */
function onLabelClick(section: OrderedSection): void {
  if (!section.enabled) {
    emit('toggle', section.type)
  }
  emit('select', section.type)
}

interface OrderedSection {
  type: SectionType
  label: string
  enabled: boolean
  column: 'left' | 'right'
}

const orderedSections = computed<OrderedSection[]>(() => {
  // Keep all sections in fixed SECTION_TYPES order regardless of enabled state
  return SECTION_TYPES.map((type) => ({
    type,
    label: SECTION_LABELS[type],
    enabled: props.enabledSections.includes(type),
    column: props.columnAssignments[type] ?? 'right',
  }))
})

/**
 *
 * @param event
 * @param sectionType
 */
function onDragStart(event: MouseEvent, sectionType: SectionType) {
  dragType.value = sectionType

  /**
   *
   * @param e
   */
  function onMouseUp(e: MouseEvent) {
    document.removeEventListener('mouseup', onMouseUp)
    if (!dragType.value) return

    // Find the target element under the mouse
    const target = document.elementFromPoint(e.clientX, e.clientY)
    const targetItem = target?.closest('li') as HTMLElement | null
    if (targetItem) {
      const labelSpan = targetItem.querySelector('label span:last-child')
      const targetType = labelSpan?.textContent?.trim()
      const targetSection = SECTION_TYPES.find(
        (t) => SECTION_LABELS[t] === targetType,
      )
      if (targetSection && targetSection !== dragType.value) {
        // Simple reorder: move dragged item before/after target
        const enabledList = orderedSections.value
          .filter((s) => s.enabled)
          .map((s) => s.type)
        const draggedIdx = enabledList.indexOf(dragType.value)
        const targetIdx = enabledList.indexOf(targetSection)

        if (draggedIdx !== -1 && targetIdx !== -1) {
          const newOrder = [...enabledList]
          newOrder.splice(draggedIdx, 1)
          newOrder.splice(targetIdx, 0, dragType.value)
          emit('reorder', newOrder)
        }
      }
    }
    dragType.value = null
  }

  document.addEventListener('mouseup', onMouseUp)
}
</script>
