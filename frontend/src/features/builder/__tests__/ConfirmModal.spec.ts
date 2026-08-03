import { describe, it, expect, afterEach } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import ConfirmModal from '@/features/builder/components/ConfirmModal.vue'

describe('ConfirmModal', () => {
  let wrapper: VueWrapper<unknown> | null = null
  let wrapperDiv: HTMLDivElement | null = null

  /**
   * Mount the ConfirmModal. Because reka-ui DialogPortal uses Teleport,
   * content is rendered to document.body. We mount onto a div attached
   * to body so that cleanup is easy.
   */
  function mountModal(modelValue = false, overrides = {}) {
    wrapperDiv = document.createElement('div')
    document.body.appendChild(wrapperDiv)
    wrapper = mount(ConfirmModal, {
      props: {
        modelValue,
        ...overrides,
      },
      attachTo: wrapperDiv,
    })
    return wrapper
  }

  afterEach(async () => {
    // Unmount the wrapper first to trigger Vue's cleanup lifecycle
    if (wrapper) {
      wrapper.unmount()
      wrapper = null
    }
    // Remove the mount div
    if (wrapperDiv && wrapperDiv.parentNode) {
      wrapperDiv.parentNode.removeChild(wrapperDiv)
      wrapperDiv = null
    }
    // Flush microtasks so reka-ui's Teleport cleanup completes
    await nextTick()
    await nextTick()
    // Clean up any remaining portal elements that reka-ui left behind
    // (Teleport cleanup can be async and may not complete synchronously)
    const remaining = document.body.querySelectorAll('[role="dialog"]')
    remaining.forEach((el) => el.parentElement?.remove())
    // Also clean up overlay elements (fixed bg-black/50 divs injected by reka-ui)
    const overlays = document.body.querySelectorAll('[data-state]')
    overlays.forEach((el) => {
      if (el.parentElement === document.body || el.classList.contains('fixed')) {
        el.remove()
      }
    })
  })

  // ─── Rendering ─────────────────────────────────────────────────

  it('renders with default props when modelValue is true', async () => {
    mountModal(true)
    await nextTick()

    const title = document.body.querySelector('h2')
    const desc = document.body.querySelector('p')
    const confirmBtn = document.body.querySelector('[data-testid="confirm-modal-confirm"]')
    const cancelBtn = document.body.querySelector('[data-testid="confirm-modal-cancel"]')

    expect(title).toBeTruthy()
    expect(title!.textContent).toBe('Confirm')
    expect(desc).toBeTruthy()
    expect(desc!.textContent).toBe('Are you sure?')
    expect(confirmBtn).toBeTruthy()
    expect(confirmBtn!.textContent).toBe('Confirm')
    expect(cancelBtn).toBeTruthy()
    expect(cancelBtn!.textContent).toBe('Cancel')
  })

  it('renders custom title, description, and button text', async () => {
    mountModal(true, {
      title: 'Unsaved Changes',
      description: 'You have unsaved changes. Leave anyway?',
      confirmText: 'Leave',
      cancelText: 'Stay',
    })
    await nextTick()

    const title = document.body.querySelector('h2')
    const desc = document.body.querySelector('p')
    const confirmBtn = document.body.querySelector('[data-testid="confirm-modal-confirm"]')
    const cancelBtn = document.body.querySelector('[data-testid="confirm-modal-cancel"]')

    expect(title!.textContent).toBe('Unsaved Changes')
    expect(desc!.textContent).toBe('You have unsaved changes. Leave anyway?')
    expect(confirmBtn!.textContent).toBe('Leave')
    expect(cancelBtn!.textContent).toBe('Stay')
  })

  it('renders nothing when modelValue is false', async () => {
    mountModal(false)
    await nextTick()
    const title = document.body.querySelector('h2')
    expect(title).toBeNull()
  })

  it('toggles visibility when modelValue changes', async () => {
    const vm = mountModal(false)
    await nextTick()
    // Dialog content should not be rendered when modelValue is false
    const dialogWhenClosed = document.body.querySelector('[role="dialog"]')
    expect(dialogWhenClosed).toBeNull()

    await vm.setProps({ modelValue: true })
    await nextTick()
    const dialogWhenOpen = document.body.querySelector('[role="dialog"]')
    expect(dialogWhenOpen).toBeTruthy()
    expect(dialogWhenOpen!.getAttribute('data-state')).toBe('open')

    await vm.setProps({ modelValue: false })
    await nextTick()
    // reka-ui keeps dialog elements during close animation with data-state="closed"
    // The dialog should either be removed or in closed state
    const dialogAfterClose = document.body.querySelector('[role="dialog"]')
    // reka-ui keeps dialog elements during close animation with data-state="closed"
    // If dialog is still in DOM, it should be in closed state; if removed, treat as closed
    expect(dialogAfterClose ? dialogAfterClose.getAttribute('data-state') : 'closed').toBe('closed')
    // Title should be hidden or removed
    const title = document.body.querySelector('h2')
    const parentDialog = title?.closest('[role="dialog"]')
    expect(parentDialog ? parentDialog.getAttribute('data-state') : 'closed').toBe('closed')
  })

  // ─── Confirm button ────────────────────────────────────────────

  it('emits "confirm" when confirm button is clicked', async () => {
    const vm = mountModal(true)
    await nextTick()

    const confirmBtn = document.body.querySelector('[data-testid="confirm-modal-confirm"]') as HTMLButtonElement
    confirmBtn.click()
    await nextTick()

    expect(vm.emitted('confirm')).toBeTruthy()
    expect(vm.emitted('confirm')).toHaveLength(1)
  })

  it('closes modal after confirm', async () => {
    const vm = mountModal(true)
    await nextTick()

    const confirmBtn = document.body.querySelector('[data-testid="confirm-modal-confirm"]') as HTMLButtonElement
    confirmBtn.click()
    await nextTick()

    const lastEmit = vm.emitted('update:modelValue')!
    expect(lastEmit[lastEmit.length - 1]).toEqual([false])
  })

  // ─── Cancel button ─────────────────────────────────────────────

  it('emits "cancel" when cancel button is clicked', async () => {
    const vm = mountModal(true)
    await nextTick()

    const cancelBtn = document.body.querySelector('[data-testid="confirm-modal-cancel"]') as HTMLButtonElement
    cancelBtn.click()
    await nextTick()

    expect(vm.emitted('cancel')).toBeTruthy()
    expect(vm.emitted('cancel')).toHaveLength(1)
  })

  it('closes modal after cancel', async () => {
    const vm = mountModal(true)
    await nextTick()

    const cancelBtn = document.body.querySelector('[data-testid="confirm-modal-cancel"]') as HTMLButtonElement
    cancelBtn.click()
    await nextTick()

    const lastEmit = vm.emitted('update:modelValue')!
    expect(lastEmit[lastEmit.length - 1]).toEqual([false])
  })

  // ─── Event ordering ────────────────────────────────────────────

  it('emits confirm event before update:modelValue', async () => {
    const vm = mountModal(true)
    await nextTick()

    const confirmBtn = document.body.querySelector('[data-testid="confirm-modal-confirm"]') as HTMLButtonElement
    confirmBtn.click()
    await nextTick()

    const emitted = vm.emitted()
    if (!emitted) throw new Error('No events emitted')

    // confirm should fire before modelValue update
    const events = Object.keys(emitted)
    const confirmIdx = events.indexOf('confirm')
    const updateIdx = events.indexOf('update:modelValue')

    expect(confirmIdx).toBeGreaterThanOrEqual(0)
    expect(updateIdx).toBeGreaterThanOrEqual(0)
    expect(confirmIdx).toBeLessThan(updateIdx)
  })

  // ─── Teleported content contains role="dialog" ─────────────────

  it('renders a dialog in the body with role="dialog"', async () => {
    mountModal(true)
    await nextTick()

    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).toBeTruthy()
  })
})
