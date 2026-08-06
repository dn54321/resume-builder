<template>
  <div class="mb-6">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground m-0 mb-3">Sections</h3>
    <ul class="list-none p-0 m-0 flex flex-col gap-2">
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
      <li
        v-for="section in orderedSections"
        :key="section.type"
        class="flex items-center gap-2 p-2 rounded-md bg-muted/20 cursor-default transition-all"
        :class="{
          'opacity-55': !section.enabled,
          'opacity-50': dragType === section.type,
          'border-t-2 border-primary': dropIndicator?.type === section.type && dropIndicator?.position === 'above',
          'border-b-2 border-primary': dropIndicator?.type === section.type && dropIndicator?.position === 'below',
        }"
        :draggable="true"
        @dragstart="onDragStart($event, section.type)"
        @dragover="onDragOver($event, section.type)"
        @dragleave="onDragLeave($event, section.type)"
        @drop="onDrop($event, section.type)"
        @dragend="onDragEnd"
      >
        <!-- Eye toggle: section visibility (replaces the old toggle switch) -->
        <button
          type="button"
          class="w-7 h-7 flex items-center justify-center border-none bg-transparent rounded-sm text-sm cursor-pointer transition-colors hover:bg-muted/50 hover:text-foreground"
          :class="section.enabled ? 'text-foreground' : 'text-muted-foreground/50'"
          :title="section.enabled ? 'Hide section' : 'Show section'"
          :aria-label="`Toggle ${section.label} visibility`"
          :aria-pressed="section.enabled"
          data-testid="section-eye-toggle"
          @click.stop="emit('toggle', section.type)"
        >
          <Eye v-if="section.enabled" class="w-4 h-4" />
          <EyeOff v-else class="w-4 h-4" />
        </button>

        <!-- Lock toggle was removed from section rows — the
             Tailor-protect lock now lives on individual sub-items inside
             the editors. The eye (visibility) toggle stays on sections. -->

        <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions, vuejs-accessibility/click-events-have-key-events, vuejs-accessibility/label-has-for -->
        <label class="flex items-center gap-2 flex-1 cursor-pointer" @click.prevent="onLabelClick(section)">
          <span
            class="text-[0.8125rem] cursor-pointer"
            :class="section.type === selectedSectionId ? 'font-semibold text-primary' : section.enabled ? 'text-foreground' : 'text-muted-foreground/70'"
          >{{ section.label }}</span>
        </label>

        <select
          v-if="layout === 'column2-1' && showTwoColumn && section.enabled"
          :value="section.column"
          @change="emit('setColumn', section.type, ($event.target as HTMLSelectElement).value as 'left' | 'right')"
          class="text-xs py-1 px-2 border border-border rounded-sm bg-surface text-foreground font-[inherit]"
          aria-label="Column assignment for {{ section.label }}"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>

        <!-- Grab handle: shown for ALL sections (visible and hidden) — hidden
             sections stay in the list and are reorderable too (RES-109). -->
        <button
          class="w-7 h-7 flex items-center justify-center border-none bg-transparent text-muted-foreground/70 cursor-grab rounded-sm text-sm hover:bg-muted/50 hover:text-foreground active:cursor-grabbing"
          title="Drag to reorder"
          :aria-label="`Reorder ${section.label}`"
        >
          &#x2630;
        </button>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Eye, EyeOff } from '@lucide/vue'
import {
  SECTION_TYPES,
  SECTION_LABELS,
  type SectionType,
  type LayoutType,
} from '@/features/builder/types/resume'

const props = withDefaults(defineProps<{
  layout: LayoutType
  enabledSections: SectionType[]
  /** Display order of ALL sections (visible + hidden interleaved by order — RES-109) */
  orderedSectionTypes?: SectionType[]
  columnAssignments: Record<SectionType, 'left' | 'right'>
  selectedSectionId?: string | null
  /** When false (default), the column assignment dropdowns are hidden behind the ?layout=True feature flag. */
  showTwoColumn?: boolean
}>(), {
  showTwoColumn: false,
})

const emit = defineEmits<{
  toggle: [sectionType: SectionType]
  setColumn: [sectionType: SectionType, column: 'left' | 'right']
  reorder: [orderedTypes: SectionType[]]
  select: [sectionType: SectionType]
}>()

const dragType = ref<SectionType | null>(null)
const dropIndicator = ref<{ type: SectionType; position: 'above' | 'below' } | null>(null)

/**
 * Handle label click: select the section and scroll the editor to it.
 * Visibility toggling is done via the eye icon button, not the label.
 * For disabled sections, also toggle them on first (enables + scrolls in one click).
 * @param section
 */
function onLabelClick(section: OrderedSection): void {
  if (section.enabled) {
    emit('select', section.type)
  } else {
    // Enable the section first, then select it so the editor scrolls to it
    emit('toggle', section.type)
    emit('select', section.type)
  }
}

interface OrderedSection {
  type: SectionType
  label: string
  enabled: boolean
  column: 'left' | 'right'
}

const orderedSections = computed<OrderedSection[]>(() => {
  // Use the store-provided order if available, otherwise fall back to SECTION_TYPES
  const displayOrder = props.orderedSectionTypes ?? SECTION_TYPES
  return displayOrder.map((type) => ({
    type,
    label: SECTION_LABELS[type],
    enabled: props.enabledSections.includes(type),
    column: props.columnAssignments[type] ?? 'right',
  }))
})

/**
 * Handle HTML5 dragstart — set effect allowed and store the dragged section type.
 * Both visible AND hidden sections are draggable: hidden sections stay in the
 * list (interleaved by order, RES-109) and must be reorderable too.
 * @param event
 * @param sectionType
 */
function onDragStart(event: DragEvent, sectionType: SectionType) {
  if (!event.dataTransfer) return
  dragType.value = sectionType
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', sectionType)
}

/**
 * Handle dragover — determine above/below position and show insertion indicator.
 * Must call preventDefault() to allow dropping.
 * Drops are allowed on ALL sections (visible and hidden) — hidden sections
 * hold a position in the list and must be usable as drop targets (RES-109).
 * @param event
 * @param sectionType
 */
function onDragOver(event: DragEvent, sectionType: SectionType) {
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
 * Handle drop — compute the new FULL section order (hidden sections keep
 * their interleaved position) and emit the reorder event.
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

  // Don't allow dropping on self
  if (dragType.value === targetType) {
    dragType.value = null
    dropIndicator.value = null
    return
  }

  // Full display order (visible + hidden interleaved) — hidden sections are
  // valid drop targets and keep their position in the emitted order (RES-109).
  const fullList = orderedSections.value.map((s) => s.type)

  const draggedIdx = fullList.indexOf(dragType.value)
  let targetIdx = fullList.indexOf(targetType)

  if (draggedIdx === -1 || targetIdx === -1) {
    dragType.value = null
    dropIndicator.value = null
    return
  }

  // If dropping below, insert after target
  if (dropIndicator.value?.position === 'below') {
    targetIdx++
  }

  const newOrder = [...fullList]
  newOrder.splice(draggedIdx, 1)

  // Adjust target index if dragged was before target (array shrank by 1)
  const adjustedTargetIdx = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx
  newOrder.splice(adjustedTargetIdx, 0, dragType.value)

  // Emit the FULL order (all section types, hidden included) — the store
  // applies it verbatim so hidden sections never get pushed to the end.
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
