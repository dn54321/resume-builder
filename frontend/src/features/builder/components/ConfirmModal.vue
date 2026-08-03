<template>
  <DialogRoot v-model:open="open" :modal="true">
    <DialogPortal>
      <DialogOverlay
        class="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
      />
      <DialogContent
        class="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-6 shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]"
        @escape-key-down.prevent
        @pointer-down-outside.prevent
      >
        <DialogTitle class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
          {{ title }}
        </DialogTitle>
        <DialogDescription class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {{ description }}
        </DialogDescription>

        <div class="flex justify-end gap-2">
          <button
            class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700"
            @click="onCancel"
            data-testid="confirm-modal-cancel"
          >
            {{ cancelText }}
          </button>
          <button
            class="px-4 py-2 rounded-md text-[0.8125rem] font-[inherit] font-medium cursor-pointer transition-colors border border-red-500 bg-red-500 text-white hover:bg-red-600"
            @click="onConfirm"
            data-testid="confirm-modal-confirm"
          >
            {{ confirmText }}
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

const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  description?: string
  confirmText?: string
  cancelText?: string
}>(), {
  title: 'Confirm',
  description: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

const open = ref(props.modelValue)

watch(() => props.modelValue, (val) => {
  open.value = val
})

watch(open, (val) => {
  emit('update:modelValue', val)
})

/**
 * User clicked confirm — emit confirm event and close.
 */
function onConfirm() {
  emit('confirm')
  open.value = false
}

/**
 * User clicked cancel — emit cancel event and close.
 */
function onCancel() {
  emit('cancel')
  open.value = false
}
</script>
