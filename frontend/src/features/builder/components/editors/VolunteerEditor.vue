<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-foreground">
      Volunteer
      <span
        v-if="store.isFiltered"
        class="font-normal text-xs text-muted-foreground"
      >
        &mdash; Showing {{ filteredCount.visible }} of {{ filteredCount.total }} bullets
      </span>
    </h3>
    <EntryList
      :entries="editor.entries.value.filter((e) => !e.parentId)"
      add-label="Add Volunteer Role"
      :entry-title="entryTitle"
      :show-entry-toggles="false"
      @add="addRole"
      @remove="onRemoveRole"
      @reorder="editor.reorderEntries"
    >
      <template #fields="{ entry, index: entryIndex }">
        <div class="flex flex-col gap-2.5">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">Organization</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'organization')"
              @input="editor.updateField(entry.id, 'organization', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted/30 disabled:text-muted-foreground/70"
              placeholder="Habitat for Humanity"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">Role</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'role')"
              @input="editor.updateField(entry.id, 'role', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted/30 disabled:text-muted-foreground/70"
              placeholder="Volunteer Coordinator"
            />
          </div>
          <div class="flex gap-2">
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-xs font-medium text-foreground">Start Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'startDate')"
                @input="editor.updateField(entry.id, 'startDate', ($event.target as HTMLInputElement).value)"
                class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted/30 disabled:text-muted-foreground/70"
              />
            </div>
            <div class="flex flex-col gap-1 flex-1">
              <label class="text-xs font-medium text-foreground">End Date</label>
              <input
                type="month"
                :value="editor.getFieldValue(entry.id, 'endDate')"
                @input="editor.updateField(entry.id, 'endDate', ($event.target as HTMLInputElement).value)"
                class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted/30 disabled:text-muted-foreground/70"
                :disabled="isCurrentRole(entry.id)"
              />
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-medium text-foreground">Location</label>
            <input
              type="text"
              :value="editor.getFieldValue(entry.id, 'location')"
              @input="editor.updateField(entry.id, 'location', ($event.target as HTMLInputElement).value)"
              class="px-2 py-1.5 border border-border rounded-sm text-[0.8125rem] font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted/30 disabled:text-muted-foreground/70"
              placeholder="San Francisco, CA"
            />
          </div>
          <label class="flex items-center gap-2 text-[0.8125rem] text-foreground cursor-pointer">
            <input
              type="checkbox"
              :checked="isCurrentRole(entry.id)"
              @change="toggleCurrentRole(entry.id)"
              class="w-4 h-4 cursor-pointer"
            />
            Current role
          </label>
          <div class="mt-2 pt-2 border-t border-border">
            <label class="text-xs font-medium text-foreground">Bullet Points</label>
            <BulletList
              :bullets="bulletStates(entry.id, entryIndex)"
              @add="editor.addBullet(entry.id)"
              @remove="editor.removeBullet"
              @update="(idx: number, val: string) => onBulletUpdate(entry.id, idx, val)"
              @reorder="(from: number, to: number) => editor.reorderBullets(entry.id, from, to)"
              @toggle-lock="editor.toggleEntryLock"
              @toggle-visibility="editor.toggleEntryVisibility"
            >
              <template #bullet="{ index: bulletIndex }">
                <span
                  v-if="store.isFiltered"
                  class="text-[0.6875rem] shrink-0 w-4 text-center cursor-default"
                  :class="store.isBulletRelevant('volunteer', entryIndex, bulletIndex) ? 'text-green-600' : 'text-muted-foreground/40'"
                  :title="store.isBulletRelevant('volunteer', entryIndex, bulletIndex) ? 'Relevant' : 'Filtered out'"
                >
                  {{ store.isBulletRelevant('volunteer', entryIndex, bulletIndex) ? '&#10003;' : '&#10005;' }}
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

const editor = useSectionEditor('volunteer')
const store = useResumeStore()

const ROLE_FIELDS = ['organization', 'role', 'startDate', 'endDate', 'location', 'isCurrent']

const filteredCount = computed(() => store.getFilteredBulletCount('volunteer'))

/**
 * Add a new volunteer role entry with empty default fields.
 */
function addRole() {
  editor.addEntry(ROLE_FIELDS.map((k) => ({ key: k, value: '' })))
}

/**
 * Remove a volunteer role and its child bullet entries.
 * @param id - The entry id to remove.
 */
function onRemoveRole(id: string) {
  // Also remove child bullets
  const bullets = editor.getChildren(id)
  for (const b of bullets) {
    editor.removeBullet(b.id)
  }
  editor.removeEntry(id)
}

/**
 * Build the display title for an entry: "role at organization".
 * @param entry
 * @param entry.id
 * @param entry.order
 */
function entryTitle(entry: { id: string; order: number }): string {
  const organization = editor.getFieldValue(entry.id, 'organization') || '(New Role)'
  const role = editor.getFieldValue(entry.id, 'role')
  return role ? `${role} at ${organization}` : organization
}

/**
 * Whether the entry is marked as a current role.
 * @param entryId
 */
function isCurrentRole(entryId: string): boolean {
  return editor.getFieldValue(entryId, 'isCurrent') === 'true'
}

/**
 * Toggle the "Current role" flag, clearing endDate when activating.
 * @param entryId
 */
function toggleCurrentRole(entryId: string) {
  const current = isCurrentRole(entryId)
  editor.updateField(entryId, 'isCurrent', current ? 'false' : 'true')
  if (!current) {
    editor.updateField(entryId, 'endDate', '')
  }
}

/**
 * Build bullet states for an entry, sorted by order, with tailor dimming.
 * @param parentId
 * @param entryIndex
 */
function bulletStates(parentId: string, entryIndex: number): BulletState[] {
  return editor.getChildren(parentId)
    .sort((a, b) => a.order - b.order)
    .map((b, i) => ({
      id: b.id,
      value: b.fields.find((f) => f.key === 'text')?.value ?? '',
      locked: b.locked,
      visible: b.visible,
      dimmed: store.isFiltered && !store.isBulletRelevant('volunteer', entryIndex, i),
    }))
}

/**
 * Update a bullet's text value by index within the entry's children.
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
