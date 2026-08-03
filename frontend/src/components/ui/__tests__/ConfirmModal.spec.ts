import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmModal from '@/components/ui/ConfirmModal.vue'

/**
 *
 * @param props
 * @param props.open
 * @param props.title
 * @param props.description
 * @param props.confirmLabel
 * @param props.variant
 */
function mountModal(props: {
  open?: boolean
  title?: string
  description?: string
  confirmLabel?: string
  variant?: 'destructive' | 'default'
} = {}) {
  return mount(ConfirmModal, {
    props: {
      open: props.open ?? true,
      title: props.title ?? 'Confirm Action',
      description: props.description ?? 'Are you sure you want to proceed?',
      confirmLabel: props.confirmLabel,
      variant: props.variant,
    },
    attachTo: document.body,
  })
}

describe('ConfirmModal', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
    // Clean up any leftover teleported dialogs from previous tests
    document.querySelectorAll('[role="alertdialog"]').forEach((el) => el.remove())
  })

  afterEach(() => {
    document.body.style.overflow = ''
    document.querySelectorAll('[role="alertdialog"]').forEach((el) => el.remove())
  })

  describe('rendering', () => {
    it('renders when open is true', () => {
      mountModal({ open: true })
      const dialog = document.querySelector('[role="alertdialog"]')
      expect(dialog).not.toBeNull()
    })

    it('does not render when open is false', () => {
      mountModal({ open: false })
      const dialog = document.querySelector('[role="alertdialog"]')
      expect(dialog).toBeNull()
    })

    it('re-renders when open changes from false to true', async () => {
      const wrapper = mountModal({ open: false })
      expect(document.querySelector('[role="alertdialog"]')).toBeNull()

      await wrapper.setProps({ open: true })
      expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()
    })

    it('hides when open changes from true to false', async () => {
      const wrapper = mountModal({ open: true })
      expect(document.querySelector('[role="alertdialog"]')).not.toBeNull()

      await wrapper.setProps({ open: false })
      expect(document.querySelector('[role="alertdialog"]')).toBeNull()
    })

    it('displays the title prop', () => {
      mountModal({ title: 'Delete Resume' })
      const dialog = document.querySelector('[role="alertdialog"]')!
      expect(dialog.textContent).toContain('Delete Resume')
    })

    it('displays the description prop', () => {
      mountModal({ description: 'This action cannot be undone.' })
      const dialog = document.querySelector('[role="alertdialog"]')!
      expect(dialog.textContent).toContain('This action cannot be undone.')
    })
  })

  describe('props', () => {
    it('renders default confirmLabel as "Confirm"', () => {
      mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button')
      const confirmButton = Array.from(buttons).find(
        (btn) => btn.textContent!.trim() === 'Confirm',
      )
      expect(confirmButton).not.toBeUndefined()
    })

    it('renders custom confirmLabel', () => {
      mountModal({ confirmLabel: 'Delete' })
      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button')
      const confirmButton = Array.from(buttons).find(
        (btn) => btn.textContent!.trim() === 'Delete',
      )
      expect(confirmButton).not.toBeUndefined()
    })

    it('renders Cancel button', () => {
      mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button')
      const cancelButton = Array.from(buttons).find(
        (btn) => btn.textContent!.trim() === 'Cancel',
      )
      expect(cancelButton).not.toBeUndefined()
    })

    it('applies default variant to confirm button when variant is default', () => {
      mountModal({ variant: 'default' })
      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button')
      const confirmButton = Array.from(buttons).find(
        (btn) => btn.textContent!.trim() !== 'Cancel',
      ) as HTMLButtonElement
      expect(confirmButton).not.toBeUndefined()
      // default variant uses bg-primary classes
      expect(confirmButton.className).toContain('bg-primary')
    })

    it('applies destructive variant to confirm button when variant is destructive', () => {
      mountModal({ variant: 'destructive' })
      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button')
      const confirmButton = Array.from(buttons).find(
        (btn) => btn.textContent!.trim() !== 'Cancel',
      ) as HTMLButtonElement
      expect(confirmButton).not.toBeUndefined()
      // destructive variant uses bg-destructive classes
      expect(confirmButton.className).toContain('bg-destructive')
    })
  })

  describe('events', () => {
    it('emits confirm when confirm button is clicked', async () => {
      const wrapper = mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button')
      const confirmButton = Array.from(buttons).find(
        (btn) => btn.textContent!.trim() !== 'Cancel',
      ) as HTMLButtonElement
      confirmButton.click()
      await nextTick()
      expect(wrapper.emitted('confirm')).toHaveLength(1)
    })

    it('emits cancel when cancel button is clicked', async () => {
      const wrapper = mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button')
      const cancelButton = Array.from(buttons).find(
        (btn) => btn.textContent!.trim() === 'Cancel',
      ) as HTMLButtonElement
      cancelButton.click()
      await nextTick()
      expect(wrapper.emitted('cancel')).toHaveLength(1)
    })

    it('emits cancel when backdrop is clicked', async () => {
      const wrapper = mountModal()
      // The outer wrapper div has role="alertdialog" and @click handler
      const outer = document.querySelector('[role="alertdialog"]') as HTMLElement
      outer.click()
      await nextTick()
      expect(wrapper.emitted('cancel')).toHaveLength(1)
    })

    it('does not emit cancel when the card itself is clicked', async () => {
      const wrapper = mountModal()
      // Click on the Card element inside the dialog
      const card = document.querySelector('[role="alertdialog"] .rounded-lg') as HTMLElement
      card.click()
      await nextTick()
      // The click bubbles to the outer div, but onBackdropClick checks event.target === event.currentTarget
      expect(wrapper.emitted('cancel')).toBeFalsy()
    })

    it('emits cancel when Escape key is pressed', async () => {
      const wrapper = mountModal()
      // onKeyStroke listens on document by default
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      expect(wrapper.emitted('cancel')).toHaveLength(1)
    })

    it('does not emit cancel on Escape when modal is closed', async () => {
      const wrapper = mountModal({ open: false })
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      expect(wrapper.emitted('cancel')).toBeFalsy()
    })

    it('does not emit cancel on Escape after modal is closed via prop change', async () => {
      const wrapper = mountModal({ open: true })
      await wrapper.setProps({ open: false })

      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      await nextTick()
      expect(wrapper.emitted('cancel')).toBeFalsy()
    })
  })

  describe('accessibility', () => {
    it('has role="alertdialog"', () => {
      mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')
      expect(dialog).not.toBeNull()
    })

    it('has aria-modal="true"', () => {
      mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')!
      expect(dialog.getAttribute('aria-modal')).toBe('true')
    })

    it('has aria-labelledby pointing to the title', () => {
      mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')!
      const labelledBy = dialog.getAttribute('aria-labelledby')
      expect(labelledBy).toBeTruthy()
      const titleEl = document.getElementById(labelledBy!)
      expect(titleEl).not.toBeNull()
      expect(titleEl!.tagName).toBe('H2')
      expect(titleEl!.textContent).toBe('Confirm Action')
    })

    it('has aria-describedby pointing to the description', () => {
      mountModal()
      const dialog = document.querySelector('[role="alertdialog"]')!
      const describedBy = dialog.getAttribute('aria-describedby')
      expect(describedBy).toBeTruthy()
      const descEl = document.getElementById(describedBy!)
      expect(descEl).not.toBeNull()
      expect(descEl!.textContent).toBe('Are you sure you want to proceed?')
    })

    it('focuses the first focusable element when opened', async () => {
      const wrapper = mountModal({ open: false })
      await wrapper.setProps({ open: true })
      await nextTick()
      await nextTick() // extra tick for focus to settle

      const dialog = document.querySelector('[role="alertdialog"]')!
      const firstButton = dialog.querySelector('button') as HTMLButtonElement
      expect(document.activeElement).toBe(firstButton)
    })

    it('traps focus within the dialog (Tab cycles through buttons)', async () => {
      mountModal()
      await nextTick()
      await nextTick()

      const dialog = document.querySelector('[role="alertdialog"]')!
      const buttons = dialog.querySelectorAll('button') as NodeListOf<HTMLButtonElement>

      // Focus should be on first button (Cancel)
      expect(document.activeElement).toBe(buttons[0])

      // Press Tab - should move to second button (Confirm)
      const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })
      dialog.dispatchEvent(tabEvent)
      await nextTick()

      // Press Tab again on the outer wrapper — should wrap back to first
      const outer = document.querySelector('[role="alertdialog"]') as HTMLElement
      outer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }))
      await nextTick()
      expect(document.activeElement).toBe(buttons[0])

      // Press Shift+Tab — should wrap to last button
      outer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))
      await nextTick()
      expect(document.activeElement).toBe(buttons[1])
    })
  })

  describe('scroll lock', () => {
    it('locks body scroll when open', () => {
      mountModal({ open: true })
      expect(document.body.style.overflow).toBe('hidden')
    })

    it('does not lock body scroll when closed', () => {
      mountModal({ open: false })
      expect(document.body.style.overflow).not.toBe('hidden')
    })

    it('restores scroll when modal is closed via prop change', async () => {
      const wrapper = mountModal({ open: true })
      expect(document.body.style.overflow).toBe('hidden')

      await wrapper.setProps({ open: false })
      await nextTick()
      expect(document.body.style.overflow).not.toBe('hidden')
    })
  })

  describe('responsive and styling', () => {
    it('backdrop has bg-black/50 class', () => {
      mountModal()
      const backdrop = document.querySelector(
        '.bg-black\\/50',
      )
      expect(backdrop).not.toBeNull()
      expect(backdrop!.getAttribute('aria-hidden')).toBe('true')
    })

    it('card has max-width constraint', () => {
      mountModal()
      const card = document.querySelector('.max-w-\\[400px\\]')
      expect(card).not.toBeNull()
    })

    it('dialog is centered via flex layout', () => {
      mountModal()
      const outer = document.querySelector('[role="alertdialog"]')!
      expect(outer.className).toContain('flex')
      expect(outer.className).toContain('items-center')
      expect(outer.className).toContain('justify-center')
    })
  })

  describe('cleanup', () => {
    it('restores body scroll on unmount when open', () => {
      const wrapper = mountModal({ open: true })
      expect(document.body.style.overflow).toBe('hidden')
      wrapper.unmount()
      expect(document.body.style.overflow).not.toBe('hidden')
    })

    it('does not break when unmounted while closed', () => {
      const wrapper = mountModal({ open: false })
      expect(() => wrapper.unmount()).not.toThrow()
    })
  })
})
