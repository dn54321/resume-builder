<template>
  <div class="mb-6">
    <h3 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground m-0 mb-3">Layout</h3>
    <div class="flex gap-3">
      <button
        class="flex-1 flex flex-col items-center gap-1.5 px-3 py-4 border-2 border-border rounded-lg bg-surface cursor-pointer transition-colors hover:border-primary font-[inherit]"
        :class="{ 'border-primary! ring-2 ring-primary/30': modelValue === 'standard' }"
        @click="$emit('update:modelValue', 'standard')"
        aria-label="Standard layout"
      >
        <div class="w-12 h-9 flex justify-center gap-0.5 mb-1">
          <div class="w-full h-full border border-muted-foreground/50 rounded-sm"></div>
        </div>
        <span class="text-[0.8125rem] font-semibold text-foreground">Standard</span>
        <span class="text-[0.6875rem] text-muted-foreground">Single column</span>
      </button>
      <button
        class="flex-1 flex flex-col items-center gap-1.5 px-3 py-4 border-2 border-border rounded-lg bg-surface cursor-pointer transition-colors hover:border-primary font-[inherit]"
        :class="{ 'border-primary! ring-2 ring-primary/30': modelValue === 'column2-1' }"
        @click="$emit('update:modelValue', 'column2-1')"
        aria-label="2:1 Column layout"
      >
        <div class="w-12 h-9 flex gap-0.5 mb-1">
          <div class="w-1/3 h-full border border-muted-foreground/50 rounded-sm"></div>
          <div class="w-2/3 h-full border border-muted-foreground/50 rounded-sm"></div>
        </div>
        <span class="text-[0.8125rem] font-semibold text-foreground">2:1 Column</span>
        <span class="text-[0.6875rem] text-muted-foreground">Left sidebar + main content</span>
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


