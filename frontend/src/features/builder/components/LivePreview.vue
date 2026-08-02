<template>
  <div class="live-preview flex flex-col h-full bg-gray-200">
    <!-- Header bar -->
    <div class="live-preview__header h-8 px-3 border-b border-gray-300 flex items-center justify-between shrink-0">
      <span class="text-xs text-gray-500 font-medium select-none">Preview</span>
      <Button variant="ghost" size="xs" @click="fullscreenOpen = true">
        <Maximize class="size-3" />
        <span class="ml-1">Full Screen</span>
      </Button>
    </div>

    <!-- Paper container -->
    <div class="flex justify-center items-start flex-1 overflow-y-auto py-3">
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

    <!-- Fullscreen modal -->
    <FullscreenPreview v-model:open="fullscreenOpen" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { Maximize } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { useResumeStore } from '@/features/builder/stores/resume'
import { PAPER_WIDTH_PX } from '@/features/builder/constants/paper'
import StandardLayout from './preview/StandardLayout.vue'
import TwoColumnLayout from './preview/TwoColumnLayout.vue'
import FullscreenPreview from './FullscreenPreview.vue'

const store = useResumeStore()

const fullscreenOpen = ref(false)

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
/* Paper dimension & print styles — kept as scoped CSS for physical units (px, in) */
.live-preview__paper {
  width: 816px;
  height: 1056px;
  background: #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1);
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
