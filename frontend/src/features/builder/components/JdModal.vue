<template>
  <DialogRoot v-model:open="open" :modal="true">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
      >
        <DialogTitle class="text-lg font-semibold text-foreground mb-1">
          Job Description
        </DialogTitle>
        <DialogDescription class="text-sm text-muted-foreground mb-4">
          Paste a job description to tailor your resume to the role.
        </DialogDescription>

        <textarea
          v-model="localJd"
          class="w-full min-h-[150px] px-3 py-2.5 border border-border rounded-md text-[0.8125rem] font-[inherit] text-foreground bg-surface resize-y box-border transition-colors focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary disabled:bg-muted/30 disabled:text-muted-foreground/70"
          :class="{ 'border-destructive!': error }"
          placeholder="Paste a job description here to find the most relevant experience and skills..."
          :disabled="tailoring"
          rows="5"
          data-testid="jd-textarea"
        ></textarea>

        <div
          v-if="error"
          class="mt-2 px-3 py-2 rounded-sm bg-destructive/10 text-destructive text-[0.8125rem] leading-relaxed"
          data-testid="jd-modal-error"
        >
          {{ error }}
        </div>

        <div class="mt-4 flex justify-end gap-2">
          <button
            class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-border bg-surface text-foreground hover:bg-muted"
            :disabled="tailoring"
            @click="onCancel"
            data-testid="jd-modal-cancel"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed border border-primary bg-primary text-primary-foreground hover:not-disabled:bg-primary/90 flex items-center gap-2"
            :disabled="tailoring"
            @click="onTailor"
            data-testid="jd-modal-tailor"
          >
            <span
              v-if="tailoring"
              class="inline-block w-[14px] h-[14px] border-2 border-white/30 border-t-white rounded-full animate-spin"
              aria-label="Loading"
            ></span>
            <span>{{ tailoring ? 'Tailoring…' : 'Tailor Resume' }}</span>
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'
import { useResumeStore } from '@/features/builder/stores/resume'

const props = defineProps<{
  modelValue: boolean
  /**
   * Whether a tailor run is in flight (RES-98). The parent owns the tailor
   * request (so the overlay animation and eye flips share one source of
   * truth); the modal only reflects the state to disable its controls.
   */
  tailoring?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  /**
   * Fired with the trimmed JD when the user clicks "Tailor Resume" (RES-98).
   * The parent closes the modal and runs tailoring in one step.
   */
  tailor: [jobDescription: string]
}>()

const store = useResumeStore()
const open = ref(props.modelValue)
const localJd = ref(props.modelValue ? store.jdText : '')
/** Inline validation error (empty JD) — API errors surface in the toolbar. */
const error = ref<string | null>(null)

// Two-way bind modelValue <-> open
watch(() => props.modelValue, (val) => {
  open.value = val
  if (val) {
    // Initialize localJd from store when modal opens and clear stale errors.
    localJd.value = store.jdText
    error.value = null
  }
})

watch(open, (val) => {
  emit('update:modelValue', val)
})

/**
 * One-step flow (RES-98): clicking "Tailor Resume" emits the JD so the
 * parent can run tailoring directly — no separate save step. An empty JD
 * keeps the modal open and shows an inline error instead.
 */
function onTailor() {
  const trimmed = localJd.value.trim()
  if (!trimmed) {
    error.value = 'Please enter a job description'
    return
  }
  error.value = null
  emit('tailor', trimmed)
}

/**
 * Discard unsaved changes and close modal.
 */
function onCancel() {
  open.value = false
}
</script>
