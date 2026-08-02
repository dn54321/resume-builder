<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-gray-900">Certifications</h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Certification"
      :entry-title="entryTitle"
      @add="addCertification"
      @remove="editor.removeEntry"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry }">
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-gray-900">Name</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'name')"
              @input="editor.updateField(entry.id, 'name', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="AWS Solutions Architect"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-gray-900">Issuer</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'issuer')"
              @input="editor.updateField(entry.id, 'issuer', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="Amazon Web Services"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-gray-900">Date</label>
            <input
              type="month"
              :value="editor.getFieldValue(entry.id, 'date')"
              @input="editor.updateField(entry.id, 'date', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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


