<template>
  <div class="pdf-export">
    <button
      class="pdf-export__button"
      :disabled="isExporting"
      @click="handleExport"
    >
      <span v-if="isExporting" class="pdf-export__spinner" aria-hidden="true" />
      <span>{{ isExporting ? 'Exporting...' : 'Download PDF' }}</span>
    </button>
    <p v-if="exportError" class="pdf-export__error" role="alert">
      {{ exportError }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { usePdfExport } from '@/features/builder/composables/usePdfExport'

const { isExporting, exportError, exportPdf } = usePdfExport()

/**
 *
 */
async function handleExport(): Promise<void> {
  await exportPdf()
}
</script>

<style scoped>
.pdf-export {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.pdf-export__button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid var(--color-border, #d1d5db);
  border-radius: 0.375rem;
  background: var(--color-background, #fff);
  color: var(--color-text, #111827);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.pdf-export__button:hover:not(:disabled) {
  background: var(--color-background-soft, #f3f4f6);
  border-color: var(--color-text-muted, #9ca3af);
}

.pdf-export__button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.pdf-export__spinner {
  display: inline-block;
  width: 1em;
  height: 1em;
  border: 2px solid var(--color-border, #d1d5db);
  border-top-color: var(--color-text, #111827);
  border-radius: 50%;
  animation: pdf-export-spin 0.6s linear infinite;
}

@keyframes pdf-export-spin {
  to {
    transform: rotate(360deg);
  }
}

.pdf-export__error {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-error, #dc2626);
}
</style>
