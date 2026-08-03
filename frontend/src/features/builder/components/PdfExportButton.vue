<template>
  <div class="flex items-center gap-2">
    <button
      class="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border border-border rounded-md bg-surface text-foreground cursor-pointer transition-colors hover:not-disabled:bg-muted hover:not-disabled:border-muted-foreground/50 disabled:opacity-60 disabled:cursor-not-allowed"
      :disabled="isExporting"
      @click="handleExport"
    >
      <span v-if="isExporting" class="inline-block w-[1em] h-[1em] border-2 border-muted-foreground/40 border-t-foreground rounded-full animate-spin" aria-hidden="true" />
      <span>{{ isExporting ? 'Exporting...' : 'Download PDF' }}</span>
    </button>
    <p v-if="exportError" class="m-0 text-xs text-destructive" role="alert">
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


