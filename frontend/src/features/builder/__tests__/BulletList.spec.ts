import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import BulletList, { type BulletState } from '@/features/builder/components/shared/BulletList.vue'

/**
 *
 * @param count
 */
function createBullets(count: number): BulletState[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `bullet-${i + 1}`,
    value: `Bullet ${i + 1}`,
  }))
}

describe('BulletList', () => {
  it('renders all bullets with their values', () => {
    const bullets = createBullets(2)
    const wrapper = mount(BulletList, { props: { bullets } })

    const inputs = wrapper.findAll('input[type="text"]')
    expect(inputs).toHaveLength(2)
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('Bullet 1')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('Bullet 2')
  })

  it('renders add bullet button', () => {
    const wrapper = mount(BulletList, { props: { bullets: [] } })
    expect(wrapper.text()).toContain('Add bullet point')
  })

  it('emits update with index and value on input', async () => {
    const bullets = createBullets(1)
    const wrapper = mount(BulletList, { props: { bullets } })

    const input = wrapper.find('input[type="text"]')
    await input.setValue('Updated text')

    expect(wrapper.emitted('update')).toHaveLength(1)
    expect(wrapper.emitted('update')![0]).toEqual([0, 'Updated text'])
  })

  it('emits remove after confirmation', async () => {
    vi.stubGlobal('confirm', vi.fn<() => boolean>(() => true))
    const bullets = createBullets(1)
    const wrapper = mount(BulletList, { props: { bullets } })

    const removeBtn = wrapper.find('button[aria-label="Remove bullet point"]')
    await removeBtn.trigger('click')

    expect(vi.mocked(window.confirm)).toHaveBeenCalled()
    expect(wrapper.emitted('remove')).toHaveLength(1)
    expect(wrapper.emitted('remove')![0]).toEqual(['bullet-1'])
    vi.unstubAllGlobals()
  })

  it('does not emit remove when confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn<() => boolean>(() => false))
    const bullets = createBullets(1)
    const wrapper = mount(BulletList, { props: { bullets } })

    const removeBtn = wrapper.find('button[aria-label="Remove bullet point"]')
    await removeBtn.trigger('click')

    expect(vi.mocked(window.confirm)).toHaveBeenCalled()
    expect(wrapper.emitted('remove')).toBeFalsy()
    vi.unstubAllGlobals()
  })

  it('emits add when the add button is clicked', async () => {
    const wrapper = mount(BulletList, { props: { bullets: [] } })
    const addBtn = wrapper.findAll('button').find((b) => b.text().includes('Add bullet point'))!
    await addBtn.trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  // ── Bullet visibility (eye) toggle (RES-106) ────────────────────

  it('renders an eye button per bullet (open icon when visible)', () => {
    const bullets = createBullets(2)
    const wrapper = mount(BulletList, { props: { bullets } })

    const eyeButtons = wrapper.findAll('[data-testid="bullet-eye-toggle"]')
    expect(eyeButtons).toHaveLength(2)
    expect(wrapper.findAll('svg.lucide-eye')).toHaveLength(2)
    expect(wrapper.findAll('svg.lucide-eye-off')).toHaveLength(0)
  })

  it('shows an EyeOff icon for hidden bullets', () => {
    const bullets = [
      { id: 'b1', value: 'Hidden', visible: false },
      { id: 'b2', value: 'Shown' },
    ]
    const wrapper = mount(BulletList, { props: { bullets } })

    expect(wrapper.findAll('svg.lucide-eye-off')).toHaveLength(1)
    expect(wrapper.findAll('svg.lucide-eye')).toHaveLength(1)

    const rows = wrapper.findAll('[data-drag-row="bullet"]')
    const firstEye = rows[0]!.find('[data-testid="bullet-eye-toggle"]')
    expect(firstEye.classes()).toContain('text-muted-foreground/50')
    const secondEye = rows[1]!.find('[data-testid="bullet-eye-toggle"]')
    expect(secondEye.classes()).not.toContain('text-muted-foreground/50')
  })

  it('emits toggleVisibility with the bullet id when the eye button is clicked', async () => {
    vi.stubGlobal('confirm', vi.fn<() => boolean>(() => false))
    const bullets = createBullets(1)
    const wrapper = mount(BulletList, { props: { bullets } })

    const eyeBtn = wrapper.find('[data-testid="bullet-eye-toggle"]')
    await eyeBtn.trigger('click')

    expect(wrapper.emitted('toggleVisibility')).toHaveLength(1)
    expect(wrapper.emitted('toggleVisibility')![0]).toEqual(['bullet-1'])
    // Eye toggle must NOT trigger the remove confirmation.
    expect(vi.mocked(window.confirm)).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  // ── Bullet lock toggle (RES-106) ────────────────────────────────

  it('renders a lock button per bullet (open icon when unlocked)', () => {
    const bullets = createBullets(2)
    const wrapper = mount(BulletList, { props: { bullets } })

    const lockButtons = wrapper.findAll('[data-testid="bullet-lock-toggle"]')
    expect(lockButtons).toHaveLength(2)
    expect(wrapper.findAll('svg.lucide-lock-open')).toHaveLength(2)
    expect(wrapper.findAll('svg.lucide-lock')).toHaveLength(0)
  })

  it('shows a closed Lock icon for locked bullets', () => {
    const bullets = [
      { id: 'b1', value: 'Locked', locked: true },
      { id: 'b2', value: 'Free' },
    ]
    const wrapper = mount(BulletList, { props: { bullets } })

    expect(wrapper.findAll('svg.lucide-lock')).toHaveLength(1)
    expect(wrapper.findAll('svg.lucide-lock-open')).toHaveLength(1)

    const rows = wrapper.findAll('[data-drag-row="bullet"]')
    const firstLock = rows[0]!.find('[data-testid="bullet-lock-toggle"]')
    expect(firstLock.classes()).toContain('text-muted-foreground/50')
  })

  it('emits toggleLock with the bullet id when the lock button is clicked', async () => {
    vi.stubGlobal('confirm', vi.fn<() => boolean>(() => false))
    const bullets = createBullets(1)
    const wrapper = mount(BulletList, { props: { bullets } })

    const lockBtn = wrapper.find('[data-testid="bullet-lock-toggle"]')
    await lockBtn.trigger('click')

    expect(wrapper.emitted('toggleLock')).toHaveLength(1)
    expect(wrapper.emitted('toggleLock')![0]).toEqual(['bullet-1'])
    // Lock toggle must NOT trigger the remove confirmation.
    expect(vi.mocked(window.confirm)).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('emits reorder when dragging a bullet onto another row', async () => {
    const bullets = createBullets(2)
    const wrapper = mount(BulletList, { props: { bullets } })

    const rows = wrapper.findAll('[data-drag-row="bullet"]')
    const firstHandle = rows[0]!.find('span[title="Drag to reorder"]')
    const secondRow = rows[1]!.element as HTMLElement

    // Simulate mousedown on first handle, then mouseup over the second row.
    await firstHandle.trigger('mousedown', { clientX: 10, clientY: 10 })
    document.elementFromPoint = vi.fn<() => HTMLElement>(() => secondRow)
    document.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 50 }))
    await Promise.resolve()

    expect(wrapper.emitted('reorder')).toHaveLength(1)
    expect(wrapper.emitted('reorder')![0]).toEqual([0, 1])
  })
})
