<template>
  <div class="education-editor">
    <h3 class="education-editor__title">Education</h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Education"
      :entry-title="entryTitle"
      @add="addEducation"
      @remove="editor.removeEntry"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry }">
        <div class="education-editor__fields">
          <div class="education-editor__field">
            <label class="education-editor__label">School</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'school')"
              @input="editor.updateField(entry.id, 'school', ($event.target as HTMLInputElement).value)"
              class="education-editor__input"
              placeholder="University of California"
            />
          </div>
          <div class="education-editor__field">
            <label class="education-editor__label">Degree</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'degree')"
              @input="editor.updateField(entry.id, 'degree', ($event.target as HTMLInputElement).value)"
              class="education-editor__input"
              placeholder="Bachelor of Science"
            />
          </div>
          <div class="education-editor__field">
            <label class="education-editor__label">Field of Study</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'fieldOfStudy')"
              @input="editor.updateField(entry.id, 'fieldOfStudy', ($event.target as HTMLInputElement).value)"
              class="education-editor__input"
              placeholder="Computer Science"
            />
          </div>
          <div class="education-editor__row">
            <div class="education-editor__field education-editor__field--half">
              <label class="education-editor__label">Start Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'startDate')"
                @input="editor.updateField(entry.id, 'startDate', ($event.target as HTMLInputElement).value)"
                class="education-editor__input"
              />
            </div>
            <div class="education-editor__field education-editor__field--half">
              <label class="education-editor__label">End Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'endDate')"
                @input="editor.updateField(entry.id, 'endDate', ($event.target as HTMLInputElement).value)"
                class="education-editor__input"
              />
            </div>
          </div>
        </div>
      </template>
    </EntryList>
  </div>
</template>

<script setup lang="ts">
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'
import EntryList from '@/features/builder/components/shared/EntryList.vue'

const editor = useSectionEditor('education')

const EDU_FIELDS = ['school', 'degree', 'fieldOfStudy', 'startDate', 'endDate']

function addEducation() {
  editor.addEntry(EDU_FIELDS.map((k) => ({ key: k, value: '' })))
}

function entryTitle(entry: { id: string; order: number }): string {
  const school = editor.getFieldValue(entry.id, 'school') || '(New Education)'
  const degree = editor.getFieldValue(entry.id, 'degree')
  return degree ? `${degree} — ${school}` : school
}
</script>

<style scoped>
.education-editor {
  padding: 1rem;
}

.education-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.education-editor__fields {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.education-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.education-editor__field--half {
  flex: 1;
}

.education-editor__row {
  display: flex;
  gap: 0.5rem;
}

.education-editor__label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.education-editor__input {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.education-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}
</style>
