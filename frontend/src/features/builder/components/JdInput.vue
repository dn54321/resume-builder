<template>
  <div class="p-4">
    <div class="flex items-center gap-2 mb-3">
      <h3 class="text-[0.9375rem] font-semibold m-0 text-foreground">Tailor to Job Description</h3>
      <span v-if="store.isFiltered" class="text-[0.6875rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary">Filtered</span>
    </div>

    <textarea
      v-model="localJd"
      class="w-full min-h-[150px] px-3 py-2.5 border border-border rounded-md text-[0.8125rem] font-[inherit] text-foreground bg-surface resize-y box-border transition-colors focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted/30 disabled:text-muted-foreground/70"
      :class="{ 'border-destructive!': tailorError }"
      placeholder="Paste a job description here to find the most relevant experience and skills..."
      :disabled="isTailoring"
      rows="5"
      data-testid="jd-textarea"
    ></textarea>

    <div v-if="tailorError" class="mt-2 px-3 py-2 rounded-sm bg-destructive/10 text-destructive text-[0.8125rem] leading-relaxed" data-testid="jd-error">
      {{ tailorError }}
    </div>

    <div v-if="store.isFiltered && !tailorError" class="mt-2 flex items-start gap-1.5 px-3 py-2 rounded-sm bg-muted/30 text-muted-foreground text-xs leading-relaxed">
      <template v-if="store.isFiltered">
        <span class="shrink-0 mt-px">&#9432;</span>
        <span>
          Showing relevant bullets (max {{ bulletCap }} per entry)
          &mdash;
          <button class="p-0 border-none bg-transparent text-primary cursor-pointer text-xs font-[inherit] underline hover:text-primary/90" @click="resetFilter">
            Reset to show all
          </button>
        </span>
      </template>
    </div>

    <div class="mt-3 flex gap-2">
      <button
        class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-primary bg-primary text-primary-foreground hover:not-disabled:bg-primary/90 hover:not-disabled:border-primary/90"
        :disabled="isTailoring || !localJd.trim()"
        @click="onTailor"
        data-testid="tailor-btn"
      >
        <span
          v-if="isTailoring"
          class="inline-block w-[14px] h-[14px] border-2 border-white/30 border-t-white rounded-full animate-spin"
          aria-label="Loading"
        ></span>
        <span v-else>Tailor Resume</span>
      </button>
      <button
        v-if="store.isFiltered"
        class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-border bg-surface text-foreground hover:not-disabled:bg-muted"
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


