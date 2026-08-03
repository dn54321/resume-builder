<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-foreground">Summary</h3>
    <div class="flex flex-col gap-1.5">
      <textarea
        :value="summaryText"
        @input="update(($event.target as HTMLTextAreaElement).value)"
        class="px-3 py-2 border border-border rounded-md text-sm font-[inherit] text-foreground bg-surface resize-y min-h-[120px] focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
        rows="6"
        placeholder="Write a brief professional summary..."
        maxlength="2000"
      ></textarea>
      <span class="text-xs text-muted-foreground/70 text-right">{{ characterCount }} / 2000</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'

const editor = useSectionEditor('summary')

onMounted(() => {
  if (editor.entries.value.length === 0) {
    editor.addEntry([{ key: 'text', value: '' }])
  }
})

const summaryText = computed(() => {
  const entry = editor.entries.value[0]
  if (!entry) return ''
  return editor.getFieldValue(entry.id, 'text')
})

const characterCount = computed(() => summaryText.value.length)

/**
 *
 * @param value
 */
function update(value: string) {
  const entry = editor.entries.value[0]
  if (!entry) return
  editor.updateField(entry.id, 'text', value)
}
</script>


