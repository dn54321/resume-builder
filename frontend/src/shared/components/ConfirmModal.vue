<template>
  <DialogRoot v-model:open="open" :modal="true">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 bg-white p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
      >
        <DialogTitle class="text-lg font-semibold text-gray-900 mb-1">
          {{ title }}
        </DialogTitle>
        <DialogDescription class="text-sm text-gray-500 mb-4">
          {{ description }}
        </DialogDescription>

        <div class="mt-4 flex justify-end gap-2">
          <button
            class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-gray-300 bg-white text-gray-900 hover:bg-gray-100"
            @click="onCancel"
            data-testid="confirm-modal-cancel"
          >
            {{ cancelLabel }}
          </button>
          <button
            :class="confirmButtonClass"
            @click="onConfirm"
            data-testid="confirm-modal-confirm"
          >
            {{ confirmLabel }}
          </button>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  DialogRoot,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from 'reka-ui'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    title?: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    variant?: 'default' | 'destructive'
  }>(),
  {
    title: 'Are you sure?',
    description: '',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    variant: 'default',
  },
)

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

const open = ref(props.modelValue)

// Two-way bind modelValue <-> open
watch(
  () => props.modelValue,
  (val) => {
    open.value = val
  },
)

watch(open, (val) => {
  emit('update:modelValue', val)
})

const confirmButtonClass = computed(() => {
  if (props.variant === 'destructive') {
    return 'px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-red-600 bg-red-600 text-white hover:bg-red-700'
  }
  return 'px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-blue-500 bg-blue-500 text-white hover:bg-blue-600'
})

/**
 * Confirm action and close modal.
 */
function onConfirm() {
  emit('confirm')
  open.value = false
}

/**
 * Cancel and close modal.
 */
function onCancel() {
  emit('cancel')
  open.value = false
}
</script>
