<template>
  <div class="flex items-center gap-2">
    <button
      class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-gray-300 rounded-md bg-white text-gray-900 cursor-pointer transition-colors hover:not-disabled:bg-gray-100 hover:not-disabled:border-gray-400 disabled:opacity-60 disabled:cursor-not-allowed"
      :disabled="isExporting"
      @click="handleExport"
    >
      <span v-if="isExporting" class="inline-block w-[1em] h-[1em] border-2 border-gray-300 border-t-gray-900 rounded-full animate-spin" aria-hidden="true" />
      <span>{{ isExporting ? 'Exporting...' : 'Download PDF' }}</span>
    </button>
    <p v-if="exportError" class="m-0 text-xs text-red-600" role="alert">
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


