<template>
  <div class="live-preview flex flex-col h-full bg-gray-200 dark:bg-gray-900">
    <!-- Header bar -->
    <!--
      The fullscreen expand button that used to live here was removed in
      RES-81 — on mobile the FullscreenPreview modal is now opened by the
      FAB in ResumeBuilder.vue (the sole fullscreen trigger), and on
      desktop (>=1024px) the inline preview is used directly (RES-86).
    -->
    <div
      class="live-preview__header h-10 px-4 border-b border-gray-300 bg-white flex items-center justify-between shrink-0"
    >
      <span class="text-sm font-medium text-gray-600">Preview</span>
    </div>

    <!-- Paper area -->
    <div
      ref="bodyRef"
      class="live-preview__body flex justify-center items-start overflow-y-auto py-3 flex-1"
    >
      <div
        id="resume-preview"
        class="live-preview__paper"
        :style="{ transform: `scale(${scale})` }"
      >
        <StandardLayout v-if="store.layout === 'standard'" :sections="store.sections" />
        <TwoColumnLayout v-else :sections="store.sections" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import StandardLayout from './preview/StandardLayout.vue'
import TwoColumnLayout from './preview/TwoColumnLayout.vue'

const store = useResumeStore()

// US Letter size at 96 DPI
const PAPER_WIDTH_PX = 816
// Max scale: 1.2x for comfortable editing on large screens
const MAX_SCALE = 1.2

const containerWidth = ref(300)
const bodyRef = ref<HTMLElement | null>(null)

const scale = computed(() => {
  if (containerWidth.value <= 0) return 0.3
  // Add some padding (24px) so the scaled paper isn't flush against edges
  const availableWidth = containerWidth.value - 24
  const s = availableWidth / PAPER_WIDTH_PX
  return Math.min(s, MAX_SCALE)
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = bodyRef.value
  if (el && 'ResizeObserver' in window) {
    // Read initial width
    containerWidth.value = el.clientWidth
    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        containerWidth.value = entry.contentRect.width
      }
    })
    resizeObserver.observe(el)
  }
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
})
</script>

<style scoped>
/*
 * Paper dimension & print styles — kept as scoped CSS for:
 * - Physical paper size (816px × 1056px at 96 DPI, 8.5×11in for print)
 * - Print media query rules (no-print background, page breaks)
 * - Transform origin needed for scale-based responsive preview
 * - Box shadow (multi-layer shadow not expressible as single Tailwind utility)
 */
.live-preview__paper {
  width: 816px;
  height: 1056px;
  background: #fff;
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.15),
    0 1px 3px rgba(0, 0, 0, 0.1);
  transform-origin: top center;
  overflow: hidden;
  flex-shrink: 0;
}

@media print {
  .live-preview {
    background: none;
    padding: 0;
    overflow: visible;
  }

  .live-preview__paper {
    width: 8.5in;
    height: 11in;
    box-shadow: none;
    transform: none !important;
    page-break-after: always;
  }
}
</style>
