<template>
  <div class="p-4">
    <h3 class="text-base font-semibold m-0 mb-4 text-foreground">Name &amp; Contact</h3>
    <div class="flex flex-col gap-3">
      <div class="flex flex-col gap-1">
        <label class="text-[0.8125rem] font-medium text-foreground" for="nc-full-name">Full Name <span class="text-destructive">*</span></label>
        <input
          id="nc-full-name"
          type="text"
          :value="fieldValue('fullName')"
          @input="update('fullName', ($event.target as HTMLInputElement).value)"
          class="px-3 py-2 border border-border rounded-md text-sm font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary invalid:border-destructive"
          placeholder="John Doe"
          required
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[0.8125rem] font-medium text-foreground" for="nc-email">Email</label>
        <input
          id="nc-email"
          type="email"
          :value="fieldValue('email')"
          @input="update('email', ($event.target as HTMLInputElement).value)"
          class="px-3 py-2 border border-border rounded-md text-sm font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary invalid:border-destructive"
          placeholder="john@example.com"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[0.8125rem] font-medium text-foreground" for="nc-phone">Phone</label>
        <input
          id="nc-phone"
          type="tel"
          :value="fieldValue('phone')"
          @input="update('phone', ($event.target as HTMLInputElement).value)"
          class="px-3 py-2 border border-border rounded-md text-sm font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary invalid:border-destructive"
          placeholder="(555) 123-4567"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[0.8125rem] font-medium text-foreground" for="nc-location">Location</label>
        <input
          id="nc-location"
          type="text"
          :value="fieldValue('location')"
          @input="update('location', ($event.target as HTMLInputElement).value)"
          class="px-3 py-2 border border-border rounded-md text-sm font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary invalid:border-destructive"
          placeholder="San Francisco, CA"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[0.8125rem] font-medium text-foreground" for="nc-linkedin">LinkedIn URL</label>
        <input
          id="nc-linkedin"
          type="url"
          :value="fieldValue('linkedin')"
          @input="update('linkedin', ($event.target as HTMLInputElement).value)"
          class="px-3 py-2 border border-border rounded-md text-sm font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary invalid:border-destructive"
          placeholder="https://linkedin.com/in/username"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label class="text-[0.8125rem] font-medium text-foreground" for="nc-website">Website</label>
        <input
          id="nc-website"
          type="url"
          :value="fieldValue('website')"
          @input="update('website', ($event.target as HTMLInputElement).value)"
          class="px-3 py-2 border border-border rounded-md text-sm font-[inherit] text-foreground bg-surface focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary invalid:border-destructive"
          placeholder="https://example.com"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useSectionEditor } from '@/features/builder/composables/useSectionEditor'

const editor = useSectionEditor('name_contact')

const FIELD_KEYS = ['fullName', 'email', 'phone', 'location', 'linkedin', 'website']

// Ensure an entry exists for the contact section
onMounted(() => {
  if (editor.entries.value.length === 0) {
    editor.addEntry(FIELD_KEYS.map((k) => ({ key: k, value: '' })))
  }
})

/**
 *
 * @param key
 */
function fieldValue(key: string): string {
  const entry = editor.entries.value[0]
  if (!entry) return ''
  return editor.getFieldValue(entry.id, key)
}

/**
 *
 * @param key
 * @param value
 */
function update(key: string, value: string) {
  const entry = editor.entries.value[0]
  if (!entry) return
  editor.updateField(entry.id, key, value)
}
</script>


