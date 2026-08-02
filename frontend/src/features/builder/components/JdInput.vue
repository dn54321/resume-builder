<template>
  <div class="p-4">
    <div class="flex items-center gap-2 mb-3">
      <h3 class="text-[0.9375rem] font-semibold m-0 text-gray-900">Tailor to Job Description</h3>
      <span v-if="store.isFiltered" class="text-[0.6875rem] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-500">Filtered</span>
    </div>

    <textarea
      v-model="localJd"
      class="w-full min-h-[150px] px-3 py-2.5 border border-gray-300 rounded-md text-[0.8125rem] font-[inherit] text-gray-900 bg-white resize-y box-border transition-colors focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-400"
      :class="{ 'border-red-600!': tailorError }"
      placeholder="Paste a job description here to find the most relevant experience and skills..."
      :disabled="isTailoring"
      rows="5"
      data-testid="jd-textarea"
    ></textarea>

    <div v-if="tailorError" class="mt-2 px-3 py-2 rounded-sm bg-red-50 text-red-600 text-[0.8125rem] leading-relaxed" data-testid="jd-error">
      {{ tailorError }}
    </div>

    <div v-if="store.isFiltered && !tailorError" class="mt-2 flex items-start gap-1.5 px-3 py-2 rounded-sm bg-gray-100 text-gray-500 text-xs leading-relaxed">
      <template v-if="store.isFiltered">
        <span class="shrink-0 mt-px">&#9432;</span>
        <span>
          Showing relevant bullets (max {{ bulletCap }} per entry)
          &mdash;
          <button class="p-0 border-none bg-transparent text-blue-500 cursor-pointer text-xs font-[inherit] underline hover:text-blue-600" @click="resetFilter">
            Reset to show all
          </button>
        </span>
      </template>
    </div>

    <div class="mt-3 flex gap-2">
      <button
        class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 border border-blue-500 bg-blue-500 text-white hover:not-disabled:bg-blue-600 hover:not-disabled:border-blue-600"
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
        class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-gray-300 bg-white text-gray-900 hover:not-disabled:bg-gray-100"
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


