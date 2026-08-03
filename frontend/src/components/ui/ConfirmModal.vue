<script setup lang="ts">
/**
 * ConfirmModal — reusable confirmation dialog component.
 *
 * Uses role="alertdialog" for accessible confirmation prompts.
 * Locks body scroll when open, traps focus within the dialog,
 * and closes on Escape or backdrop click.
 */
import { watch, ref, onMounted, onUnmounted, nextTick, useId } from 'vue'
import { useScrollLock, onKeyStroke } from '@vueuse/core'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description: string
    confirmLabel?: string
    variant?: 'destructive' | 'default'
  }>(),
  {
    confirmLabel: 'Confirm',
    variant: 'default',
  },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const dialogWrapperRef = ref<HTMLElement | null>(null)
const confirmButtonRef = ref<InstanceType<typeof Button> | null>(null)
const cancelButtonRef = ref<InstanceType<typeof Button> | null>(null)

// Unique IDs for ARIA attributes
const titleId = useId()
const descId = useId()

// Lock body scroll when modal is open
const isLocked = useScrollLock(document.body)

watch(
  () => props.open,
  (isOpen) => {
    isLocked.value = isOpen
  },
  { immediate: true },
)

// Focus management
let previouslyFocusedElement: HTMLElement | null = null

/**
 * Returns all focusable elements within the dialog wrapper.
 * Excludes disabled elements.
 * @returns {HTMLElement[]} Array of focusable DOM elements
 */
function getFocusableElements(): HTMLElement[] {
  const dialogEl = dialogWrapperRef.value
  if (!dialogEl) return []
  const selector =
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  return Array.from(dialogEl.querySelectorAll<HTMLElement>(selector)).filter(
    (el) => !el.hasAttribute('disabled'),
  )
}

/**
 * Focuses the first focusable element inside the dialog on the next tick.
 */
function focusFirstElement() {
  nextTick(() => {
    const focusable = getFocusableElements()
    if (focusable.length > 0) {
      focusable[0]!.focus()
    }
  })
}

/**
 * Traps Tab and Shift+Tab key presses within the dialog to prevent
 * focus from escaping to elements behind the modal.
 * @param {KeyboardEvent} event - The keyboard event
 */
function trapFocus(event: KeyboardEvent) {
  if (event.key !== 'Tab') return

  const focusable = getFocusableElements()
  if (focusable.length === 0) {
    event.preventDefault()
    return
  }

  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!

  if (event.shiftKey) {
    if (document.activeElement === first) {
      event.preventDefault()
      last.focus()
    }
  } else {
    if (document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }
}

// Escape to cancel
onKeyStroke('Escape', () => {
  if (props.open) {
    emit('cancel')
  }
})

/**
 * Closes the dialog when the backdrop (area outside the card) is clicked.
 * @param {MouseEvent} event - The click event
 */
function onBackdropClick(event: MouseEvent) {
  if (event.target === event.currentTarget) {
    emit('cancel')
  }
}

// Watch open state to manage focus
watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      previouslyFocusedElement = document.activeElement as HTMLElement | null
      // DOM is rendered by now with flush: 'post', but we still need a tick
      // for the Teleport content to be in the DOM
      nextTick(() => focusFirstElement())
    } else {
      // Restore focus to previously focused element
      if (
        previouslyFocusedElement &&
        typeof previouslyFocusedElement.focus === 'function'
      ) {
        previouslyFocusedElement.focus()
      }
      previouslyFocusedElement = null
    }
  },
  { flush: 'post' },
)

onMounted(() => {
  if (props.open) {
    previouslyFocusedElement = document.activeElement as HTMLElement | null
    focusFirstElement()
  }
})

onUnmounted(() => {
  // Restore scroll if component is unmounted while open
  isLocked.value = false
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center"
      role="alertdialog"
      :aria-modal="true"
      :aria-labelledby="titleId"
      :aria-describedby="descId"
      @keydown="trapFocus"
      @click="onBackdropClick"
    >
      <!-- Backdrop -->
      <div class="fixed inset-0 bg-black/50" aria-hidden="true" />

      <!-- Dialog card wrapper (for focus trapping) -->
      <div
        ref="dialogWrapperRef"
        class="relative z-10 mx-4 w-full max-w-[400px]"
      >
      <Card class="p-6 shadow-xl">
        <h2
          :id="titleId"
          class="text-lg font-semibold text-card-foreground"
        >
          {{ title }}
        </h2>

        <p
          :id="descId"
          class="mt-2 text-sm text-muted-foreground"
        >
          {{ description }}
        </p>

        <div class="mt-6 flex justify-end gap-3">
          <Button
            ref="cancelButtonRef"
            variant="outline"
            @click="emit('cancel')"
          >
            Cancel
          </Button>
          <Button
            ref="confirmButtonRef"
            :variant="variant"
            @click="emit('confirm')"
          >
            {{ confirmLabel }}
          </Button>
        </div>
      </Card>
      </div>
    </div>
  </Teleport>
</template>
