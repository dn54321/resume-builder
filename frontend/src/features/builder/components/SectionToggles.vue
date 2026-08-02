<template>
  <div class="section-toggles">
    <h3 class="section-toggles__title">Sections</h3>
    <ul class="section-toggles__list">
      <li
        v-for="section in orderedSections"
        :key="section.type"
        class="section-toggles__item"
        :class="{ 'section-toggles__item--disabled': !section.enabled }"
      >
        <label class="section-toggles__toggle" @click.stop="emit('select', section.type)">
          <input
            type="checkbox"
            :checked="section.enabled"
            @change="emit('toggle', section.type)"
            class="section-toggles__checkbox"
          />
          <span class="section-toggles__slider"></span>
          <span
            class="section-toggles__label-text"
            :class="{ 'section-toggles__label-text--selected': section.type === selectedSectionId }"
          >{{ section.label }}</span>
        </label>

        <select
          v-if="layout === 'column2-1' && section.enabled"
          :value="section.column"
          @change="emit('setColumn', section.type, ($event.target as HTMLSelectElement).value as 'left' | 'right')"
          class="section-toggles__column-select"
          aria-label="Column assignment for {{ section.label }}"
        >
          <option value="left">Left</option>
          <option value="right">Right</option>
        </select>

        <button
          v-if="section.enabled"
          class="section-toggles__move-btn"
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
    const targetItem = target?.closest('.section-toggles__item') as HTMLElement | null
    if (targetItem) {
      const targetType = targetItem
        .querySelector('.section-toggles__label-text')
        ?.textContent?.trim()
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

<style scoped>
.section-toggles {
  margin-bottom: 1.5rem;
}

.section-toggles__title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 0.75rem;
}

.section-toggles__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.section-toggles__item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  border-radius: 0.375rem;
  background: var(--color-background-soft, #f9fafb);
  cursor: default;
  transition: opacity 0.15s;
}

.section-toggles__item--disabled {
  opacity: 0.55;
}

.section-toggles__toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
}

.section-toggles__checkbox {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}

.section-toggles__slider {
  position: relative;
  width: 36px;
  height: 20px;
  background: var(--color-border, #d1d5db);
  border-radius: 10px;
  flex-shrink: 0;
  transition: background 0.15s;
}

.section-toggles__slider::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  background: white;
  border-radius: 50%;
  transition: transform 0.15s;
}

.section-toggles__checkbox:checked + .section-toggles__slider {
  background: var(--color-primary, #3b82f6);
}

.section-toggles__checkbox:checked + .section-toggles__slider::after {
  transform: translateX(16px);
}

.section-toggles__label-text {
  font-size: 0.8125rem;
  color: var(--color-text, #111827);
  cursor: pointer;
}

.section-toggles__label-text--selected {
  font-weight: 600;
  color: var(--color-primary, #3b82f6);
}

.section-toggles__checkbox:not(:checked) ~ .section-toggles__label-text {
  color: var(--color-text-muted, #9ca3af);
}

.section-toggles__column-select {
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  background: var(--color-background, #fff);
  color: var(--color-text, #111827);
  font-family: inherit;
}

.section-toggles__move-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--color-text-muted, #9ca3af);
  cursor: grab;
  border-radius: 0.25rem;
  font-size: 0.875rem;
}

.section-toggles__move-btn:hover {
  background: var(--color-background-muted, #e5e7eb);
  color: var(--color-text, #111827);
}

.section-toggles__move-btn:active {
  cursor: grabbing;
}
</style>
