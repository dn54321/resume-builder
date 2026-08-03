<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-foreground">Education</h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Education"
      :entry-title="entryTitle"
      @add="addEducation"
      @remove="editor.removeEntry"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry }">
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">School</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'school')"
              @input="editor.updateField(entry.id, 'school', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="University of California"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">Degree</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'degree')"
              @input="editor.updateField(entry.id, 'degree', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Bachelor of Science"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">Field of Study</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'fieldOfStudy')"
              @input="editor.updateField(entry.id, 'fieldOfStudy', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="Computer Science"
            />
          </div>
          <div class="flex gap-2">
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-xs font-medium text-foreground">Start Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'startDate')"
                @input="editor.updateField(entry.id, 'startDate', ($event.target as HTMLInputElement).value)"
                class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              />
            </div>
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-xs font-medium text-foreground">End Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'endDate')"
                @input="editor.updateField(entry.id, 'endDate', ($event.target as HTMLInputElement).value)"
                class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
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

/**
 *
 */
function addEducation() {
  editor.addEntry(EDU_FIELDS.map((k) => ({ key: k, value: '' })))
}

/**
 *
 * @param entry
 * @param entry.id
 * @param entry.order
 */
function entryTitle(entry: { id: string; order: number }): string {
  const school = editor.getFieldValue(entry.id, 'school') || '(New Education)'
  const degree = editor.getFieldValue(entry.id, 'degree')
  return degree ? `${degree} — ${school}` : school
}
</script>


