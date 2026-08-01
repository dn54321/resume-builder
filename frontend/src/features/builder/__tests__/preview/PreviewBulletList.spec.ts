import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import PreviewBulletList from '@/features/builder/components/preview/PreviewBulletList.vue'
import type { PreviewBullet } from '@/features/builder/components/preview/PreviewBulletList.vue'

describe('PreviewBulletList', () => {
  it('renders bullets as list items', () => {
    const bullets: PreviewBullet[] = [
      { id: '1', value: 'Built feature X' },
      { id: '2', value: 'Improved performance' },
    ]
    const wrapper = mount(PreviewBulletList, {
      props: { bullets },
    })

    const items = wrapper.findAll('.preview-bullet-list__item')
    expect(items).toHaveLength(2)
    expect(items[0]!.text()).toBe('Built feature X')
    expect(items[1]!.text()).toBe('Improved performance')
  })

  it('renders empty list when bullets array is empty', () => {
    const wrapper = mount(PreviewBulletList, {
      props: { bullets: [] },
    })

    const list = wrapper.find('.preview-bullet-list')
    expect(list.exists()).toBe(true)
    expect(wrapper.findAll('.preview-bullet-list__item')).toHaveLength(0)
  })

  it('renders a single bullet', () => {
    const bullets: PreviewBullet[] = [
      { id: '1', value: 'Single bullet' },
    ]
    const wrapper = mount(PreviewBulletList, {
      props: { bullets },
    })

    expect(wrapper.findAll('.preview-bullet-list__item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Single bullet')
  })

  it('renders bullets with empty values', () => {
    const bullets: PreviewBullet[] = [
      { id: '1', value: '' },
    ]
    const wrapper = mount(PreviewBulletList, {
      props: { bullets },
    })

    const items = wrapper.findAll('.preview-bullet-list__item')
    expect(items).toHaveLength(1)
    expect(items[0]!.text()).toBe('')
  })
})
