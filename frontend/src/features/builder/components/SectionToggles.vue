<template>
  <div class="mb-6">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-gray-500 m-0 mb-3">Sections</h3>
    <ul class="list-none p-0 m-0 flex flex-col gap-2">
      <li
        v-for="section in orderedSections"
        :key="section.type"
        class="flex items-center gap-2 p-2 rounded-md bg-gray-50 cursor-default transition-all"
        :class="{
          'opacity-55': !section.enabled,
          'opacity-50': dragType === section.type,
          'border-t-2 border-blue-500': dropIndicator?.type === section.type && dropIndicator?.position === 'above',
          'border-b-2 border-blue-500': dropIndicator?.type === section.type && dropIndicator?.position === 'below',
        }"
        :draggable="section.enabled"
        @dragstart="onDragStart($event, section.type)"
        @dragover="onDragOver($event, section.type)"
        @dragleave="onDragLeave($event, section.type)"
        @drop="onDrop($event, section.type)"
        @dragend="onDragEnd"
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
const dropIndicator = ref<{ type: SectionType; position: 'above' | 'below' } | null>(null)

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
  return SECTION_TYPES.map((type) => ({
    type,
    label: SECTION_LABELS[type],
    enabled: props.enabledSections.includes(type),
    column: props.columnAssignments[type] ?? 'right',
  }))
})

/**
 * Handle HTML5 dragstart — set effect allowed and store the dragged section type.
 * Only fires on enabled (draggable) items.
 * @param event
 * @param sectionType
 */
function onDragStart(event: DragEvent, sectionType: SectionType) {
  const section = orderedSections.value.find((s) => s.type === sectionType)
  if (!section?.enabled) {
    event.preventDefault()
    return
  }
  if (!event.dataTransfer) return
  dragType.value = sectionType
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', sectionType)
}

/**
 * Handle dragover — determine above/below position and show insertion indicator.
 * Must call preventDefault() to allow dropping.
 * @param event
 * @param sectionType
 */
function onDragOver(event: DragEvent, sectionType: SectionType) {
  // Only allow drops on enabled sections (disabled stay at end)
  const section = orderedSections.value.find((s) => s.type === sectionType)
  if (!section?.enabled) return

  // Don't show indicator when dragging over yourself
  if (dragType.value === sectionType) return

  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }

  const target = event.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  const position: 'above' | 'below' = event.clientY < midY ? 'above' : 'below'

  dropIndicator.value = { type: sectionType, position }
}

/**
 * Handle dragleave — clear indicator when leaving the target element,
 * but not when moving to a child element within the same target.
 * @param event
 * @param sectionType
 */
function onDragLeave(event: DragEvent, sectionType: SectionType) {
  const target = event.currentTarget as HTMLElement
  const relatedTarget = event.relatedTarget as HTMLElement | null
  // Don't clear if moving to a child element (dragleave fires when entering child)
  if (relatedTarget && target.contains(relatedTarget)) return
  if (dropIndicator.value?.type === sectionType) {
    dropIndicator.value = null
  }
}

/**
 * Handle drop — compute new section order from dragged + target + indicator position,
 * then emit the reorder event.
 * @param event
 * @param targetType
 */
function onDrop(event: DragEvent, targetType: SectionType) {
  event.preventDefault()

  if (!dragType.value) {
    dragType.value = null
    dropIndicator.value = null
    return
  }

  // Don't allow dropping on disabled sections
  const targetSection = orderedSections.value.find((s) => s.type === targetType)
  if (!targetSection?.enabled) {
    dragType.value = null
    dropIndicator.value = null
    return
  }

  // Don't allow dropping on self
  if (dragType.value === targetType) {
    dragType.value = null
    dropIndicator.value = null
    return
  }

  // Get current enabled sections in order
  const enabledList = orderedSections.value
    .filter((s) => s.enabled)
    .map((s) => s.type)

  const draggedIdx = enabledList.indexOf(dragType.value)
  let targetIdx = enabledList.indexOf(targetType)

  if (draggedIdx === -1 || targetIdx === -1) {
    dragType.value = null
    dropIndicator.value = null
    return
  }

  // If dropping below, insert after target
  if (dropIndicator.value?.position === 'below') {
    targetIdx++
  }

  const newOrder = [...enabledList]
  newOrder.splice(draggedIdx, 1)

  // Adjust target index if dragged was before target (array shrank by 1)
  const adjustedTargetIdx = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx
  newOrder.splice(adjustedTargetIdx, 0, dragType.value)

  emit('reorder', newOrder)

  dragType.value = null
  dropIndicator.value = null
}

/**
 * Handle dragend — clean up all visual state.
 */
function onDragEnd() {
  dragType.value = null
  dropIndicator.value = null
}
</script>
