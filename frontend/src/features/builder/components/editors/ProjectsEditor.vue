<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-foreground">
      Projects
      <span
        v-if="store.isFiltered"
        class="font-normal text-xs text-muted-foreground"
      >
        &mdash; Showing {{ filteredCount.visible }} of {{ filteredCount.total }} bullets
      </span>
    </h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Project"
      :entry-title="entryTitle"
      @add="addProject"
      @remove="onRemoveProject"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry, index: entryIndex }">
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">Name</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'name')"
              @input="editor.updateField(entry.id, 'name', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="My Awesome Project"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">Description</label>
            <textarea
              :value="editor.getFieldValue(entry.id, 'description')"
              @input="editor.updateField(entry.id, 'description', ($event.target as HTMLTextAreaElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface resize-y focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              rows="3"
              placeholder="Brief description of the project..."
            ></textarea>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">URL</label>
            <input
              type="url"
              :value="editor.getFieldValue(entry.id, 'url')"
              @input="editor.updateField(entry.id, 'url', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="https://github.com/user/project"
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
          <div class="mt-2 pt-2 border-t border-border">
            <label class="text-xs font-medium text-foreground">Bullet Points</label>
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
                  :class="store.isBulletRelevant('projects', entryIndex, bulletIndex) ? 'text-green-600' : 'text-muted-foreground/40'"
                  :title="store.isBulletRelevant('projects', entryIndex, bulletIndex) ? 'Relevant' : 'Filtered out'"
                >
                  {{ store.isBulletRelevant('projects', entryIndex, bulletIndex) ? '&#10003;' : '&#10005;' }}
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

const editor = useSectionEditor('projects')
const store = useResumeStore()

const PROJ_FIELDS = ['name', 'description', 'url', 'startDate', 'endDate']

const filteredCount = computed(() => store.getFilteredBulletCount('projects'))

/**
 *
 */
function addProject() {
  editor.addEntry(PROJ_FIELDS.map((k) => ({ key: k, value: '' })))
}

/**
 *
 * @param id
 */
function onRemoveProject(id: string) {
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
  return editor.getFieldValue(entry.id, 'name') || '(New Project)'
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
      dimmed: store.isFiltered && !store.isBulletRelevant('projects', entryIndex, i),
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


