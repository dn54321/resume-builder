import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LayoutPicker from '@/features/builder/components/LayoutPicker.vue'

describe('LayoutPicker', () => {
  // ── Feature flag default (RES-86): 2:1 Column hidden ─────────────

  it('renders only the Standard layout option by default (showTwoColumn=false)', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'standard' },
    })

    const cards = wrapper.findAll('button')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.text()).toContain('Standard')
    expect(cards[0]!.text()).not.toContain('2:1 Column')
  })

  it('does not offer the 2:1 Column layout when showTwoColumn is false', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'column2-1', showTwoColumn: false },
    })

    const cards = wrapper.findAll('button')
    expect(cards).toHaveLength(1)
    expect(cards[0]!.text()).toContain('Standard')
  })

  // ── Feature flag enabled (?layout=True): 2:1 Column visible ──────

  it('renders both layout options when showTwoColumn is true', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'standard', showTwoColumn: true },
    })

    const cards = wrapper.findAll('button')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.text()).toContain('Standard')
    expect(cards[1]!.text()).toContain('2:1 Column')
  })

  it('highlights the selected card (standard)', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'standard', showTwoColumn: true },
    })

    const standardCard = wrapper.findAll('button')[0]!
    const columnCard = wrapper.findAll('button')[1]!

    expect(standardCard.classes()).toContain('border-primary!')
    expect(columnCard.classes()).not.toContain('border-primary!')
  })

  it('highlights the selected card (column2-1)', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'column2-1', showTwoColumn: true },
    })

    const standardCard = wrapper.findAll('button')[0]!
    const columnCard = wrapper.findAll('button')[1]!

    expect(standardCard.classes()).not.toContain('border-primary!')
    expect(columnCard.classes()).toContain('border-primary!')
  })

  it('emits update:modelValue when Standard is clicked', async () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'column2-1', showTwoColumn: true },
    })

    await wrapper.findAll('button')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['standard'])
  })

  it('emits update:modelValue when 2:1 Column is clicked', async () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'standard', showTwoColumn: true },
    })

    await wrapper.findAll('button')[1]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['column2-1'])
  })
})
