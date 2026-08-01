import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import LayoutPicker from '@/features/builder/components/LayoutPicker.vue'

describe('LayoutPicker', () => {
  it('renders both layout options', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'standard' },
    })

    const cards = wrapper.findAll('.layout-picker__card')
    expect(cards).toHaveLength(2)
    expect(cards[0]!.text()).toContain('Standard')
    expect(cards[1]!.text()).toContain('2:1 Column')
  })

  it('highlights the selected card (standard)', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'standard' },
    })

    const standardCard = wrapper.findAll('.layout-picker__card')[0]!
    const columnCard = wrapper.findAll('.layout-picker__card')[1]!

    expect(standardCard.classes()).toContain('layout-picker__card--selected')
    expect(columnCard.classes()).not.toContain('layout-picker__card--selected')
  })

  it('highlights the selected card (column2-1)', () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'column2-1' },
    })

    const standardCard = wrapper.findAll('.layout-picker__card')[0]!
    const columnCard = wrapper.findAll('.layout-picker__card')[1]!

    expect(standardCard.classes()).not.toContain('layout-picker__card--selected')
    expect(columnCard.classes()).toContain('layout-picker__card--selected')
  })

  it('emits update:modelValue when Standard is clicked', async () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'column2-1' },
    })

    await wrapper.findAll('.layout-picker__card')[0]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['standard'])
  })

  it('emits update:modelValue when 2:1 Column is clicked', async () => {
    const wrapper = mount(LayoutPicker, {
      props: { modelValue: 'standard' },
    })

    await wrapper.findAll('.layout-picker__card')[1]!.trigger('click')

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual(['column2-1'])
  })
})
