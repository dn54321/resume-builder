<template>
  <Dialog :open="open" :modal="true" @update:open="$emit('update:open', $event)">
    <DialogContent
      class="fullscreen-preview__content flex items-center justify-center bg-transparent border-0 shadow-none p-0 max-w-none w-screen h-screen rounded-none"
      :disable-outside-pointer-events="false"
    >
      <button
        class="fullscreen-preview__close absolute top-4 right-4 z-10 inline-flex items-center justify-center size-10 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/60"
        @click="close"
        aria-label="Close full screen preview"
      >
        <X class="size-5" />
      </button>

      <div
        class="fullscreen-preview__paper-wrapper overflow-auto max-h-screen max-w-screen"
      >
        <div
          class="fullscreen-preview__paper"
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
    </DialogContent>
  </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { X } from '@lucide/vue'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { useResumeStore } from '@/features/builder/stores/resume'
import StandardLayout from '@/features/builder/components/preview/StandardLayout.vue'
import TwoColumnLayout from '@/features/builder/components/preview/TwoColumnLayout.vue'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

// US Letter size at 96 DPI
const PAPER_WIDTH_PX = 816
const PAPER_HEIGHT_PX = 1056
const PADDING = 48

const store = useResumeStore()
const viewportWidth = ref(window.innerWidth)
const viewportHeight = ref(window.innerHeight)

/**
 * Calculate the optimal scale so the paper fits the viewport with padding.
 * Capped at 1.0 so the paper never exceeds its natural size.
 */
const scale = computed(() => {
  const availableWidth = viewportWidth.value - PADDING * 2
  const availableHeight = viewportHeight.value - PADDING * 2

  const scaleX = availableWidth / PAPER_WIDTH_PX
  const scaleY = availableHeight / PAPER_HEIGHT_PX

  return Math.min(1.0, scaleX, scaleY)
})

/**
 *
 */
function close() {
  emit('update:open', false)
}

/**
 *
 */
function onResize() {
  viewportWidth.value = window.innerWidth
  viewportHeight.value = window.innerHeight
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<style scoped>
.fullscreen-preview__paper {
  width: 816px;
  height: 1056px;
  background: #fff;
  transform-origin: top left;
  overflow: hidden;
  flex-shrink: 0;
}

.fullscreen-preview__paper-wrapper {
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}
</style>
