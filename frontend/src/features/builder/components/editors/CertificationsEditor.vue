<template>
  <div class="certifications-editor">
    <h3 class="certifications-editor__title">Certifications</h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Certification"
      :entry-title="entryTitle"
      @add="addCertification"
      @remove="editor.removeEntry"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry }">
        <div class="certifications-editor__fields">
          <div class="certifications-editor__field">
            <label class="certifications-editor__label">Name</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'name')"
              @input="editor.updateField(entry.id, 'name', ($event.target as HTMLInputElement).value)"
              class="certifications-editor__input"
              placeholder="AWS Solutions Architect"
            />
          </div>
          <div class="certifications-editor__field">
            <label class="certifications-editor__label">Issuer</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'issuer')"
              @input="editor.updateField(entry.id, 'issuer', ($event.target as HTMLInputElement).value)"
              class="certifications-editor__input"
              placeholder="Amazon Web Services"
            />
          </div>
          <div class="certifications-editor__field">
            <label class="certifications-editor__label">Date</label>
            <input
              type="month"
              :value="editor.getFieldValue(entry.id, 'date')"
              @input="editor.updateField(entry.id, 'date', ($event.target as HTMLInputElement).value)"
              class="certifications-editor__input"
            />
          </div>
        </div>
      </template>
    </EntryList>
  </div>
</template>

<script setup lang="ts">
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'
import EntryList from '@/features/builder/components/shared/EntryList.vue'

const editor = useSectionEditor('certifications')

const CERT_FIELDS = ['name', 'issuer', 'date']

/**
 *
 */
function addCertification() {
  editor.addEntry(CERT_FIELDS.map((k) => ({ key: k, value: '' })))
}

/**
 *
 * @param entry
 * @param entry.id
 * @param entry.order
 */
function entryTitle(entry: { id: string; order: number }): string {
  return editor.getFieldValue(entry.id, 'name') || '(New Certification)'
}
</script>

<style scoped>
.certifications-editor {
  padding: 1rem;
}

.certifications-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.certifications-editor__fields {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.certifications-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.certifications-editor__label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.certifications-editor__input {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.certifications-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}
</style>
