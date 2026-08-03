<script setup lang="ts">
import {
  DialogPortal,
  DialogOverlay,
  DialogContent,
  type DialogContentEmits,
  type DialogContentProps,
} from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<DialogContentProps & { class?: string }>()
const emits = defineEmits<DialogContentEmits>()
</script>

<template>
  <DialogPortal>
    <DialogOverlay
      class="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
    />
    <DialogContent
      v-bind="props"
      @escape-key-down="emits('escapeKeyDown', $event)"
      @pointer-down-outside="emits('pointerDownOutside', $event)"
      @interact-outside="emits('interactOutside', $event)"
      :class="
        cn(
          'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
          props.class,
        )
      "
    >
      <slot />
    </DialogContent>
  </DialogPortal>
</template>
