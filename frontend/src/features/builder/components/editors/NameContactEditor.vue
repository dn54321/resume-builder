<template>
  <div class="name-contact-editor">
    <h3 class="name-contact-editor__title">Name &amp; Contact</h3>
    <div class="name-contact-editor__fields">
      <div class="name-contact-editor__field">
        <label class="name-contact-editor__label" for="nc-full-name">Full Name <span class="name-contact-editor__required">*</span></label>
        <input
          id="nc-full-name"
          type="text"
          :value="fieldValue('fullName')"
          @input="update('fullName', ($event.target as HTMLInputElement).value)"
          class="name-contact-editor__input"
          placeholder="John Doe"
          required
        />
      </div>
      <div class="name-contact-editor__field">
        <label class="name-contact-editor__label" for="nc-email">Email</label>
        <input
          id="nc-email"
          type="email"
          :value="fieldValue('email')"
          @input="update('email', ($event.target as HTMLInputElement).value)"
          class="name-contact-editor__input"
          placeholder="john@example.com"
        />
      </div>
      <div class="name-contact-editor__field">
        <label class="name-contact-editor__label" for="nc-phone">Phone</label>
        <input
          id="nc-phone"
          type="tel"
          :value="fieldValue('phone')"
          @input="update('phone', ($event.target as HTMLInputElement).value)"
          class="name-contact-editor__input"
          placeholder="(555) 123-4567"
        />
      </div>
      <div class="name-contact-editor__field">
        <label class="name-contact-editor__label" for="nc-location">Location</label>
        <input
          id="nc-location"
          type="text"
          :value="fieldValue('location')"
          @input="update('location', ($event.target as HTMLInputElement).value)"
          class="name-contact-editor__input"
          placeholder="San Francisco, CA"
        />
      </div>
      <div class="name-contact-editor__field">
        <label class="name-contact-editor__label" for="nc-linkedin">LinkedIn URL</label>
        <input
          id="nc-linkedin"
          type="url"
          :value="fieldValue('linkedin')"
          @input="update('linkedin', ($event.target as HTMLInputElement).value)"
          class="name-contact-editor__input"
          placeholder="https://linkedin.com/in/username"
        />
      </div>
      <div class="name-contact-editor__field">
        <label class="name-contact-editor__label" for="nc-website">Website</label>
        <input
          id="nc-website"
          type="url"
          :value="fieldValue('website')"
          @input="update('website', ($event.target as HTMLInputElement).value)"
          class="name-contact-editor__input"
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

<style scoped>
.name-contact-editor {
  padding: 1rem;
}

.name-contact-editor__title {
  font-size: 1rem;
  font-weight: 600;
  margin: 0 0 1rem;
  color: var(--color-text, #111827);
}

.name-contact-editor__fields {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.name-contact-editor__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.name-contact-editor__label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--color-text, #111827);
}

.name-contact-editor__required {
  color: var(--color-error, #dc2626);
}

.name-contact-editor__input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
}

.name-contact-editor__input:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.name-contact-editor__input:invalid {
  border-color: var(--color-error, #dc2626);
}
</style>
