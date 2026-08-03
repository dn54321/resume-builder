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
          class="w-full min-h-[150px] px-3 py-2.5 border border-border rounded-md text-[0.8125rem] font-[inherit] text-foreground bg-surface resize-y box-border transition-colors focus:outline-hidden focus:border-primary focus:ring-1 focus:ring-primary"
          placeholder="Paste a job description here to find the most relevant experience and skills..."
          rows="5"
          data-testid="jd-textarea"
        ></textarea>

        <div class="mt-4 flex justify-end gap-2">
          <button
            class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-border bg-surface text-foreground hover:bg-muted"
            @click="onCancel"
            data-testid="jd-modal-cancel"
          >
            Cancel
          </button>
          <button
            class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-primary bg-primary text-primary-foreground hover:bg-primary/90"
            @click="onSave"
            data-testid="jd-modal-save"
          >
            Save
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
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const store = useResumeStore()
const open = ref(props.modelValue)
const localJd = ref(props.modelValue ? store.jdText : '')

// Two-way bind modelValue <-> open
watch(() => props.modelValue, (val) => {
  open.value = val
  if (val) {
    // Initialize localJd from store when modal opens
    localJd.value = store.jdText
  }
})

watch(open, (val) => {
  emit('update:modelValue', val)
})

/**
 * Save JD text to store and close modal.
 */
function onSave() {
  store.jdText = localJd.value
  open.value = false
}

/**
 * Discard unsaved changes and close modal.
 */
function onCancel() {
  open.value = false
}
</script>
