<template>
  <div class="jd-input">
    <div class="jd-input__header">
      <h3 class="jd-input__title">Tailor to Job Description</h3>
      <span v-if="store.isFiltered" class="jd-input__badge">Filtered</span>
    </div>

    <textarea
      v-model="localJd"
      class="jd-input__textarea"
      :class="{ 'jd-input__textarea--error': tailorError }"
      placeholder="Paste a job description here to find the most relevant experience and skills..."
      :disabled="isTailoring"
      rows="5"
      data-testid="jd-textarea"
    ></textarea>

    <div v-if="tailorError" class="jd-input__error" data-testid="jd-error">
      {{ tailorError }}
    </div>

    <div v-if="store.isFiltered && !tailorError" class="jd-input__info">
      <template v-if="store.isFiltered">
        <span class="jd-input__info-icon">&#9432;</span>
        <span>
          Showing relevant bullets (max {{ bulletCap }} per entry)
          &mdash;
          <button class="jd-input__info-reset" @click="resetFilter">
            Reset to show all
          </button>
        </span>
      </template>
    </div>

    <div class="jd-input__actions">
      <button
        class="jd-input__btn jd-input__btn--primary"
        :disabled="isTailoring || !localJd.trim()"
        @click="onTailor"
        data-testid="tailor-btn"
      >
        <span
          v-if="isTailoring"
          class="jd-input__spinner"
          aria-label="Loading"
        ></span>
        <span v-else>Tailor Resume</span>
      </button>
      <button
        v-if="store.isFiltered"
        class="jd-input__btn jd-input__btn--secondary"
        :disabled="isTailoring"
        @click="resetFilter"
        data-testid="reset-btn"
      >
        Reset Filter
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { useTailor } from '@/features/builder/composables/useTailor'

const store = useResumeStore()
const { isTailoring, tailorError, bulletCap, tailorResume, resetFilter } = useTailor()

const localJd = ref(store.jdText)

// Restore JD text from store on mount (session persistence)
onMounted(() => {
  if (store.jdText) {
    localJd.value = store.jdText
  }
})

/**
 *
 */
async function onTailor() {
  await tailorResume(localJd.value)
}
</script>

<style scoped>
.jd-input {
  padding: 1rem;
}

.jd-input__header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.jd-input__title {
  font-size: 0.9375rem;
  font-weight: 600;
  margin: 0;
  color: var(--color-text, #111827);
}

.jd-input__badge {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.125rem 0.5rem;
  border-radius: 999px;
  background: var(--color-primary-bg, #e0f2fe);
  color: var(--color-primary, #3b82f6);
}

.jd-input__textarea {
  width: 100%;
  min-height: 150px;
  padding: 0.625rem 0.75rem;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-family: inherit;
  color: var(--color-text, #111827);
  background: var(--color-background, #fff);
  resize: vertical;
  box-sizing: border-box;
  transition: border-color 0.15s;
}

.jd-input__textarea:focus {
  outline: none;
  border-color: var(--color-primary, #3b82f6);
  box-shadow: 0 0 0 1px var(--color-primary, #3b82f6);
}

.jd-input__textarea:disabled {
  background: var(--color-background-soft, #f3f4f6);
  color: var(--color-text-muted, #9ca3af);
}

.jd-input__textarea--error {
  border-color: var(--color-error, #dc2626);
}

.jd-input__error {
  margin-top: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: var(--color-error-bg, #fef2f2);
  color: var(--color-error, #dc2626);
  font-size: 0.8125rem;
  line-height: 1.4;
}

.jd-input__info {
  margin-top: 0.5rem;
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border-radius: 0.25rem;
  background: var(--color-background-soft, #f3f4f6);
  color: var(--color-text-muted, #6b7280);
  font-size: 0.75rem;
  line-height: 1.5;
}

.jd-input__info-icon {
  flex-shrink: 0;
  margin-top: 0.0625rem;
}

.jd-input__info-reset {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--color-primary, #3b82f6);
  cursor: pointer;
  font-size: 0.75rem;
  font-family: inherit;
  text-decoration: underline;
}

.jd-input__info-reset:hover {
  color: var(--color-primary-hover, #2563eb);
}

.jd-input__actions {
  margin-top: 0.75rem;
  display: flex;
  gap: 0.5rem;
}

.jd-input__btn {
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s, border-color 0.15s, color 0.15s;
}

.jd-input__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.jd-input__btn--primary {
  border: 1px solid var(--color-primary, #3b82f6);
  background: var(--color-primary, #3b82f6);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.jd-input__btn--primary:hover:not(:disabled) {
  background: var(--color-primary-hover, #2563eb);
  border-color: var(--color-primary-hover, #2563eb);
}

.jd-input__btn--secondary {
  border: 1px solid var(--color-border, #d1d5db);
  background: var(--color-background, #fff);
  color: var(--color-text, #111827);
}

.jd-input__btn--secondary:hover:not(:disabled) {
  background: var(--color-background-soft, #f3f4f6);
}

.jd-input__spinner {
  display: inline-block;
  width: 14px;
  height: 14px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: jd-spin 0.6s linear infinite;
}

@keyframes jd-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
