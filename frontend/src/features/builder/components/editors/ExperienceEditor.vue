<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-gray-900">
      Experience
      <span
        v-if="store.isFiltered"
        class="font-normal text-xs text-gray-500"
      >
        &mdash; Showing {{ filteredCount.visible }} of {{ filteredCount.total }} bullets
      </span>
    </h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Job"
      :entry-title="entryTitle"
      @add="addJob"
      @remove="onRemoveJob"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry, index: entryIndex }">
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-gray-900">Company</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'company')"
              @input="editor.updateField(entry.id, 'company', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              placeholder="Acme Corp"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-gray-900">Title</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'title')"
              @input="editor.updateField(entry.id, 'title', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              placeholder="Software Engineer"
            />
          </div>
          <div class="flex gap-2">
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-xs font-medium text-gray-900">Start Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'startDate')"
                @input="editor.updateField(entry.id, 'startDate', ($event.target as HTMLInputElement).value)"
                class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              />
            </div>
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-xs font-medium text-gray-900">End Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'endDate')"
                @input="editor.updateField(entry.id, 'endDate', ($event.target as HTMLInputElement).value)"
                class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
                :disabled="isCurrentJob(entry.id)"
              />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-gray-900">Location</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'location')"
              @input="editor.updateField(entry.id, 'location', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-gray-300 rounded-sm text-[0.8125rem] font-[inherit] text-gray-900 bg-white focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
              placeholder="San Francisco, CA"
            />
          </div>
          <label class="flex items-center gap-2 text-[0.8125rem] text-gray-900 cursor-pointer">
            <input
              type="checkbox"
              :checked="isCurrentJob(entry.id)"
              @change="toggleCurrentJob(entry.id)"
              class="w-4 h-4 cursor-pointer"
            />
            Current position
          </label>
          <div class="mt-2 pt-2 border-t border-gray-200">
            <label class="text-xs font-medium text-gray-900">Bullet Points</label>
            <BulletList
              :bullets="bulletStates(entry.id, entryIndex)"
              @add="editor.addBullet(entry.id)"
              @remove="editor.removeBullet"
              @update="(idx: number, val: string) => onBulletUpdate(entry.id, idx, val)"
              @reorder="(from: number, to: number) => editor.reorderBullets(entry.id, from, to)"
            >
              <template #bullet="{ index: bulletIndex }">
                <span
                  v-if="store.isFiltered"
                  class="text-[0.6875rem] shrink-0 w-4 text-center cursor-default"
                  :class="store.isBulletRelevant('experience', entryIndex, bulletIndex) ? 'text-green-600' : 'text-gray-300'"
                  :title="store.isBulletRelevant('experience', entryIndex, bulletIndex) ? 'Relevant' : 'Filtered out'"
                >
                  {{ store.isBulletRelevant('experience', entryIndex, bulletIndex) ? '&#10003;' : '&#10005;' }}
                </span>
              </template>
            </BulletList>
          </div>
        </div>
      </template>
    </EntryList>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'
import EntryList from '@/features/builder/components/shared/EntryList.vue'
import BulletList, { type BulletState } from '@/features/builder/components/shared/BulletList.vue'

const editor = useSectionEditor('experience')
const store = useResumeStore()

const JOB_FIELDS = ['company', 'title', 'startDate', 'endDate', 'location', 'isCurrent']

const filteredCount = computed(() => store.getFilteredBulletCount('experience'))

/**
 *
 */
function addJob() {
  editor.addEntry(JOB_FIELDS.map((k) => ({ key: k, value: '' })))
}

/**
 *
 * @param id
 */
function onRemoveJob(id: string) {
  // Also remove child bullets
  const bullets = editor.getChildren(id)
  for (const b of bullets) {
    editor.removeBullet(b.id)
  }
  editor.removeEntry(id)
}

/**
 *
 * @param entry
 * @param entry.id
 * @param entry.order
 */
function entryTitle(entry: { id: string; order: number }): string {
  const company = editor.getFieldValue(entry.id, 'company') || '(New Position)'
  const title = editor.getFieldValue(entry.id, 'title')
  return title ? `${title} at ${company}` : company
}

/**
 *
 * @param entryId
 */
function isCurrentJob(entryId: string): boolean {
  return editor.getFieldValue(entryId, 'isCurrent') === 'true'
}

/**
 *
 * @param entryId
 */
function toggleCurrentJob(entryId: string) {
  const current = isCurrentJob(entryId)
  editor.updateField(entryId, 'isCurrent', current ? 'false' : 'true')
  if (!current) {
    editor.updateField(entryId, 'endDate', '')
  }
}

/**
 *
 * @param parentId
 * @param entryIndex
 */
function bulletStates(parentId: string, entryIndex: number): BulletState[] {
  return editor.getChildren(parentId)
    .sort((a, b) => a.order - b.order)
    .map((b, i) => ({
      id: b.id,
      value: b.fields.find((f) => f.key === 'text')?.value ?? '',
      dimmed: store.isFiltered && !store.isBulletRelevant('experience', entryIndex, i),
    }))
}

/**
 *
 * @param parentId
 * @param index
 * @param value
 */
function onBulletUpdate(parentId: string, index: number, value: string) {
  const bullets = editor.getChildren(parentId).sort((a, b) => a.order - b.order)
  if (index < bullets.length) {
    editor.updateBullet(bullets[index]!.id, value)
  }
}
</script>


