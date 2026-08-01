<template>
  <div class="projects-editor">
    <h3 class="projects-editor__title">Projects</h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Project"
      :entry-title="entryTitle"
      @add="addProject"
      @remove="onRemoveProject"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry }">
        <div class="projects-editor__fields">
          <div class="projects-editor__field">
            <label class="projects-editor__label">Name</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'name')"
              @input="editor.updateField(entry.id, 'name', ($event.target as HTMLInputElement).value)"
              class="projects-editor__input"
              placeholder="My Awesome Project"
            />
          </div>
          <div class="projects-editor__field">
            <label class="projects-editor__label">Description</label>
            <textarea
              :value="editor.getFieldValue(entry.id, 'description')"
              @input="editor.updateField(entry.id, 'description', ($event.target as HTMLTextAreaElement).value)"
              class="projects-editor__textarea"
              rows="3"
              placeholder="Brief description of the project..."
            ></textarea>
          </div>
          <div class="projects-editor__field">
            <label class="projects-editor__label">URL</label>
            <input
              type="url"
              :value="editor.getFieldValue(entry.id, 'url')"
              @input="editor.updateField(entry.id, 'url', ($event.target as HTMLInputElement).value)"
              class="projects-editor__input"
              placeholder="https://github.com/user/project"
            />
          </div>
          <div class="projects-editor__row">
            <div class="projects-editor__field projects-editor__field--half">
              <label class="projects-editor__label">Start Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'startDate')"
                @input="editor.updateField(entry.id, 'startDate', ($event.target as HTMLInputElement).value)"
                class="projects-editor__input"
              />
            </div>
            <div class="projects-editor__field projects-editor__field--half">
              <label class="projects-editor__label">End Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'endDate')"
                @input="editor.updateField(entry.id, 'endDate', ($event.target as HTMLInputElement).value)"
                class="projects-editor__input"
              />
            </div>
          </div>
          <div class="projects-editor__bullets">
            <label class="projects-editor__label">Bullet Points</label>
            <BulletList
              :bullets="bulletStates(entry.id)"
              @add="editor.addBullet(entry.id)"
              @remove="editor.removeBullet"
              @update="(idx: number, val: string) => onBulletUpdate(entry.id, idx, val)"
              @reorder="(from: number, to: number) => editor.reorderBullets(entry.id, from, to)"
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
import BulletList, { type BulletState } from '@/features/builder/components/shared/BulletList.vue'

const editor = useSectionEditor('projects')

const PROJ_FIELDS = ['name', 'description', 'url', 'startDate', 'endDate']

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
 */
function bulletStates(parentId: string): BulletState[] {
  return editor.getChildren(parentId)
    .sort((a, b) => a.order - b.order)
    .map((b) => ({
      id: b.id,
      value: b.fields.find((f) => f.key === 'text')?.value ?? '',
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
.projects-editor {
  padding: 1rem;
}

.projects-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.projects-editor__fields {
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
}

.projects-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.projects-editor__field--half {
  flex: 1;
}

.projects-editor__row {
  display: flex;
  gap: 0.5rem;
}

.projects-editor__label {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.projects-editor__input {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.projects-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.projects-editor__textarea {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.25rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
  resize: vertical;
}

.projects-editor__textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.projects-editor__bullets {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--color-border, #e5e7eb);
}
</style>
