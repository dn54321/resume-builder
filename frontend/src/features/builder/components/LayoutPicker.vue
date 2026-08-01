<template>
  <div class="layout-picker">
    <h3 class="layout-picker__title">Layout</h3>
    <div class="layout-picker__cards">
      <button
        class="layout-picker__card"
        :class="{ 'layout-picker__card--selected': modelValue === 'standard' }"
        @click="$emit('update:modelValue', 'standard')"
        aria-label="Standard layout"
      >
        <div class="layout-picker__icon layout-picker__icon--standard">
          <div class="layout-picker__wireframe layout-picker__wireframe--full"></div>
        </div>
        <span class="layout-picker__label">Standard</span>
        <span class="layout-picker__desc">Single column</span>
      </button>
      <button
        class="layout-picker__card"
        :class="{ 'layout-picker__card--selected': modelValue === 'column2-1' }"
        @click="$emit('update:modelValue', 'column2-1')"
        aria-label="2:1 Column layout"
      >
        <div class="layout-picker__icon layout-picker__icon--columns">
          <div class="layout-picker__wireframe layout-picker__wireframe--left"></div>
          <div class="layout-picker__wireframe layout-picker__wireframe--right"></div>
        </div>
        <span class="layout-picker__label">2:1 Column</span>
        <span class="layout-picker__desc">Left sidebar + main content</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LayoutType } from '@/features/builder/types/resume'

defineProps<{
  modelValue: LayoutType
}>()

defineEmits<{
  'update:modelValue': [value: LayoutType]
}>()
</script>

<style scoped>
.layout-picker {
  margin-bottom: 1.5rem;
}

.layout-picker__title {
  font-size: 0.875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted, #6b7280);
  margin: 0 0 0.75rem;
}

.layout-picker__cards {
  display: flex;
  gap: 0.75rem;
}

.layout-picker__card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.375rem;
  padding: 1rem 0.75rem;
  border: 2px solid var(--color-border, #d1d5db);
  border-radius: 0.5rem;
  background: var(--color-background, #fff);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
  font-family: inherit;
}

.layout-picker__card:hover {
  border-color: var(--color-primary, #3b82f6);
}

.layout-picker__card--selected {
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 2px var(--color-primary-alpha, rgba(59, 130, 246, 0.3));
}

.layout-picker__icon {
  width: 48px;
  height: 36px;
  display: flex;
  gap: 2px;
  margin-bottom: 0.25rem;
}

.layout-picker__icon--standard {
  justify-content: center;
}

.layout-picker__wireframe {
  border: 1px solid var(--color-text-muted, #9ca3af);
  border-radius: 2px;
}

.layout-picker__wireframe--full {
  width: 100%;
  height: 100%;
}

.layout-picker__wireframe--left {
  width: 33%;
  height: 100%;
}

.layout-picker__wireframe--right {
  width: 66%;
  height: 100%;
}

.layout-picker__label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--color-text, #111827);
}

.layout-picker__desc {
  font-size: 0.6875rem;
  color: var(--color-text-muted, #6b7280);
}
</style>
