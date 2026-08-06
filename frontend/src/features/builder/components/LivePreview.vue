<template>
  <div class="live-preview relative flex flex-col h-full bg-gray-200 dark:bg-gray-900">
    <!-- Header bar -->
    <!--
      The fullscreen expand button that used to live here was removed: on
      mobile the FullscreenPreview modal is now opened by the FAB in
      ResumeBuilder.vue (the sole fullscreen trigger), and on desktop
      (>=1024px) the inline preview is used directly.
    -->
    <div
      class="live-preview__header h-10 px-4 border-b border-gray-300 bg-white flex items-center justify-between shrink-0"
    >
      <span class="text-sm font-medium text-gray-600">Preview</span>
    </div>

    <!-- Paper area: paper is centered in the FULL container (justify-center);
         the floating zoom controls sit at the corner on top of the edge —
         UI chrome, not part of the paper's layout box. -->
    <div
      ref="bodyRef"
      class="live-preview__body flex justify-center items-start overflow-auto py-3 flex-1"
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

    <!-- Zoom controls (RES-115): floating bottom-right of the preview pane.
         Zoom multiplies the auto-fit scale (container width → fit) so the
         paper scales up/down around the fitted size. Range 50%–150% in 10%
         steps; the % indicator shows the current zoom factor. -->
    <div
      class="live-preview__zoom-controls absolute bottom-3 right-6 z-10 inline-flex items-center gap-0.5 rounded-full border border-border bg-surface/95 p-1 shadow-md"
      role="group"
      aria-label="Preview zoom"
      data-testid="preview-zoom-controls"
    >
      <button
        class="live-preview__zoom-btn live-preview__zoom-out inline-flex items-center justify-center size-8 rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        type="button"
        :disabled="zoomFactor <= MIN_ZOOM"
        aria-label="Zoom out"
        title="Zoom out"
        data-testid="preview-zoom-out"
        @click="zoomOut"
      >
        <ZoomOut class="size-4" />
      </button>
      <span
        class="live-preview__zoom-value inline-block min-w-10 text-center text-xs font-semibold tabular-nums text-foreground select-none"
        aria-live="polite"
        data-testid="preview-zoom-value"
      >
        {{ zoomPercent }}%
      </span>
      <button
        class="live-preview__zoom-btn live-preview__zoom-in inline-flex items-center justify-center size-8 rounded-full text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        type="button"
        :disabled="zoomFactor >= MAX_ZOOM"
        aria-label="Zoom in"
        title="Zoom in"
        data-testid="preview-zoom-in"
        @click="zoomIn"
      >
        <ZoomIn class="size-4" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useResumeStore } from '@/features/builder/stores/resume'
import { ZoomIn, ZoomOut } from '@lucide/vue'
import StandardLayout from './preview/StandardLayout.vue'
import TwoColumnLayout from './preview/TwoColumnLayout.vue'

const store = useResumeStore()

// US Letter size at 96 DPI
const PAPER_WIDTH_PX = 816
// Max scale: 1.2x for comfortable editing on large screens
const MAX_SCALE = 1.2

// ─── Zoom controls (RES-115) ─────────────────────────────────────
//
// The zoom factor multiplies the auto-fit scale computed from the
// container width. Range is 50%–150% in 10% steps. The value is persisted
// per session (sessionStorage) so it survives tab reloads but not new
// sessions — explicitly optional per the ticket.
const MIN_ZOOM = 0.5
const MAX_ZOOM = 1.5
const ZOOM_STEP = 0.1
const ZOOM_STORAGE_KEY = 'resume-builder:preview-zoom'

/**
 * Clamp a zoom factor to the allowed [MIN_ZOOM, MAX_ZOOM] range.
 * @param {number} value - Raw zoom factor to clamp.
 * @returns {number} The clamped zoom factor within [MIN_ZOOM, MAX_ZOOM].
 */
function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

/**
 * Load the initial zoom factor from sessionStorage (guarded — jsdom/SSR
 * and privacy modes may lack sessionStorage). Falls back to 100%.
 * @returns {number} The initial zoom factor, clamped to [MIN_ZOOM, MAX_ZOOM].
 */
function loadInitialZoom(): number {
  try {
    const raw = window.sessionStorage?.getItem(ZOOM_STORAGE_KEY)
    if (raw) {
      const parsed = parseFloat(raw)
      if (!Number.isNaN(parsed)) {
        return clampZoom(parsed)
      }
    }
  } catch {
    // sessionStorage unavailable — fall through to default
  }
  return 1
}

/**
 * Persist the current zoom factor to sessionStorage.
 */
function persistZoom() {
  try {
    window.sessionStorage?.setItem(ZOOM_STORAGE_KEY, String(zoomFactor.value))
  } catch {
    // storage unavailable — zoom still works for the session, just isn't kept
  }
}

/**
 * Set the zoom factor (clamped) and persist it.
 * @param {number} value - Target zoom factor (will be clamped to the allowed range).
 */
function setZoom(value: number) {
  zoomFactor.value = clampZoom(value)
  persistZoom()
}

/** Zoom in by one step (clamped at MAX_ZOOM). */
function zoomIn() {
  setZoom(zoomFactor.value + ZOOM_STEP)
}

/** Zoom out by one step (clamped at MIN_ZOOM). */
function zoomOut() {
  setZoom(zoomFactor.value - ZOOM_STEP)
}

/** Current zoom factor (1 = 100%). */
const zoomFactor = ref(loadInitialZoom())

/** Zoom percentage shown in the indicator (50–150). */
const zoomPercent = computed(() => Math.round(zoomFactor.value * 100))

const containerWidth = ref(300)
const bodyRef = ref<HTMLElement | null>(null)

/**
 * Effective preview scale: the auto-fit scale (container width → paper
 * fits with padding) multiplied by the user's zoom factor. Zooming in past
 * 100% lets the paper grow beyond the pane — the body's overflow-auto
 * scrolls it — while zooming out shrinks it further.
 */
const scale = computed(() => {
  if (containerWidth.value <= 0) return 0.3 * zoomFactor.value
  // The paper centers in the FULL container width (24px breathing room);
  // the zoom controls float at the corner as UI chrome and don't shrink
  // the paper's layout box (which previously off-centered the resume).
  const availableWidth = containerWidth.value - 24
  const autoFit = Math.min(availableWidth / PAPER_WIDTH_PX, MAX_SCALE)
  return autoFit * zoomFactor.value
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

  /* RES-115: floating zoom controls are UI chrome — never printed */
  .live-preview__zoom-controls {
    display: none !important;
  }
}
</style>
