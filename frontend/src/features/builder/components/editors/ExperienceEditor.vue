<template>
  <div class="experience-editor">
    <h3 class="experience-editor__title">
      Experience
      <span
        v-if="store.isFiltered"
        class="experience-editor__filter-info"
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
        <div class="experience-editor__fields">
          <div class="experience-editor__field">
            <label class="experience-editor__label">Company</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'company')"
              @input="editor.updateField(entry.id, 'company', ($event.target as HTMLInputElement).value)"
              class="experience-editor__input"
              placeholder="Acme Corp"
            />
          </div>
          <div class="experience-editor__field">
            <label class="experience-editor__label">Title</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'title')"
              @input="editor.updateField(entry.id, 'title', ($event.target as HTMLInputElement).value)"
              class="experience-editor__input"
              placeholder="Software Engineer"
            />
          </div>
          <div class="experience-editor__row">
            <div class="experience-editor__field experience-editor__field--half">
              <label class="experience-editor__label">Start Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'startDate')"
                @input="editor.updateField(entry.id, 'startDate', ($event.target as HTMLInputElement).value)"
                class="experience-editor__input"
              />
            </div>
            <div class="experience-editor__field experience-editor__field--half">
              <label class="experience-editor__label">End Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'endDate')"
                @input="editor.updateField(entry.id, 'endDate', ($event.target as HTMLInputElement).value)"
                class="experience-editor__input"
                :disabled="isCurrentJob(entry.id)"
              />
            </div>
          </div>
          <div class="experience-editor__field">
            <label class="experience-editor__label">Location</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'location')"
              @input="editor.updateField(entry.id, 'location', ($event.target as HTMLInputElement).value)"
              class="experience-editor__input"
              placeholder="San Francisco, CA"
            />
          </div>
          <label class="experience-editor__checkbox-label">
            <input
              type="checkbox"
              :checked="isCurrentJob(entry.id)"
              @change="toggleCurrentJob(entry.id)"
              class="experience-editor__checkbox"
            />
            Current position
          </label>
          <div class="experience-editor__bullets">
            <label class="experience-editor__label">Bullet Points</label>
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
                  class="experience-editor__relevance"
                  :class="{
                    'experience-editor__relevance--yes': store.isBulletRelevant('experience', entryIndex, bulletIndex),
                    'experience-editor__relevance--no': !store.isBulletRelevant('experience', entryIndex, bulletIndex),
                  }"
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

<style scoped>
.experience-editor {
  padding: 1rem;
}

.experience-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.experience-editor__fields {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.experience-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.experience-editor__field--half {
  flex: 1;
}

.experience-editor__row {
  display: flex;
  gap: 0.5rem;
}

.experience-editor__label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.experience-editor__input {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.experience-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.experience-editor__input:disabled {
  background: var(--color-background-soft, #f3f4f6);
  color: var(--color-text-muted, #9ca3af);
}

.experience-editor__checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: var(--color-text, #111827);
  cursor: pointer;
}

.experience-editor__checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
}

.experience-editor__bullets {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border, #e5e7eb);
}

.experience-editor__filter-info {
  font-weight: 400;
  font-size: 0.75rem;
  color: var(--color-text-muted, #6b7280);
}

.experience-editor__relevance {
  font-size: 0.6875rem;
  flex-shrink: 0;
  width: 16px;
  text-align: center;
  cursor: default;
}

.experience-editor__relevance--yes {
  color: var(--color-success, #16a34a);
}

.experience-editor__relevance--no {
  color: var(--color-text-muted, #d1d5db);
}
</style>
