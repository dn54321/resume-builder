<template>
  <div class="live-preview">
    <div
      id="resume-preview"
      class="live-preview__paper"
      :style="{ transform: `scale(${scale})` }"
    >
      <StandardLayout
        v-if="store.layout === 'standard'"
        :sections="store.sections"
      />
      <TwoColumnLayout
        v-else
        :sections="store.sections"
      />
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

const containerWidth = ref(300)

const scale = computed(() => {
  if (containerWidth.value <= 0) return 0.3
  // Add some padding (24px) so the scaled paper isn't flush against edges
  const availableWidth = containerWidth.value - 24
  const s = availableWidth / PAPER_WIDTH_PX
  return Math.min(s, 1.0)
})

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  const el = document.querySelector('.live-preview')
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
.live-preview {
  display: flex;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  overflow-y: auto;
  padding: 12px 0;
  background: var(--color-background-soft, #e5e7eb);
}

.live-preview__paper {
  width: 816px;
  height: 1056px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
  transform-origin: top center;
  overflow: hidden;
  flex-shrink: 0;
}

/* Print styles: render at actual size, remove shadows */
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
