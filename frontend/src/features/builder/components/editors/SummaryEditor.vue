<template>
  <div class="summary-editor">
    <h3 class="summary-editor__title">Summary</h3>
    <div class="summary-editor__field">
      <textarea
        :value="summaryText"
        @input="update(($event.target as HTMLTextAreaElement).value)"
        class="summary-editor__textarea"
        rows="6"
        placeholder="Write a brief professional summary..."
        maxlength="2000"
      ></textarea>
      <span class="summary-editor__char-count">{{ characterCount }} / 2000</span>
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

function update(value: string) {
  const entry = editor.entries.value[0]
  if (!entry) return
  editor.updateField(entry.id, 'text', value)
}
</script>

<style scoped>
.summary-editor {
  padding: 1rem;
}

.summary-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.summary-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.summary-editor__textarea {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
  resize: vertical;
  min-height: 120px;
}

.summary-editor__textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.summary-editor__char-count {
  font-size: 0.75rem;
  color: var(--color-text-muted, #9ca3af);
  text-align: right;
}
</style>
