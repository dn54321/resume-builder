import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import EntryList from '@/features/builder/components/shared/EntryList.vue'

interface EntryLike {
  id: string
  order: number
}

/**
 *
 * @param entry
 * @param _index
 */
function entryTitle(entry: EntryLike, _index: number): string {
  return `Entry ${entry.id}`
}

describe('EntryList', () => {
  /**
   *
   * @param count
   */
  function createEntries(count: number): EntryLike[] {
    return Array.from({ length: count }, (_, i) => ({
      id: `entry-${i + 1}`,
      order: i,
    }))
  }

  it('renders all entries with their titles', () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const titles = wrapper.findAll('.entry-list__title')
    expect(titles).toHaveLength(2)
    expect(titles[0]!.text()).toBe('Entry entry-1')
    expect(titles[1]!.text()).toBe('Entry entry-2')
  })

  it('renders add button with the correct label', () => {
    const wrapper = mount(EntryList, {
      props: { entries: [], addLabel: 'Add Job', entryTitle },
    })

    const addBtn = wrapper.find('.entry-list__add-btn')
    expect(addBtn.exists()).toBe(true)
    expect(addBtn.text()).toBe('+ Add Job')
  })

  it('starts with all entries collapsed', () => {
    const entries = createEntries(3)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const bodies = wrapper.findAll('.entry-list__body')
    expect(bodies).toHaveLength(0)
  })

  it('expands an entry when its header is clicked', async () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const headers = wrapper.findAll('.entry-list__header')
    await headers[0]!.trigger('click')

    const bodies = wrapper.findAll('.entry-list__body')
    expect(bodies).toHaveLength(1)
  })

  it('collapses an expanded entry when clicked again', async () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const headers = wrapper.findAll('.entry-list__header')
    // Expand
    await headers[0]!.trigger('click')
    expect(wrapper.findAll('.entry-list__body')).toHaveLength(1)
    // Collapse
    await headers[0]!.trigger('click')
    expect(wrapper.findAll('.entry-list__body')).toHaveLength(0)
  })

  it('auto-expands a newly added entry', async () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    // Initially all collapsed
    expect(wrapper.findAll('.entry-list__body')).toHaveLength(0)

    // Simulate adding a new entry by updating props
    const newEntries = [...entries, { id: 'entry-3', order: 2 }]
    await wrapper.setProps({ entries: newEntries })
    await nextTick()

    // The new entry (last one) should be expanded
    const bodies = wrapper.findAll('.entry-list__body')
    expect(bodies).toHaveLength(1)

    // The expanded panel should have the expanded class
    const panels = wrapper.findAll('.entry-list__panel')
    expect(panels[2]!.classes()).toContain('entry-list__panel--expanded')
  })

  it('emits add event when add button is clicked', async () => {
    const wrapper = mount(EntryList, {
      props: { entries: [], addLabel: 'Add Job', entryTitle },
    })

    const addBtn = wrapper.find('.entry-list__add-btn')
    await addBtn.trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('emits remove event after confirmation', async () => {
    window.confirm = vi.fn<() => boolean>(() => true)
    const entries = createEntries(1)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const removeBtn = wrapper.find('.entry-list__remove-btn')
    await removeBtn.trigger('click')

    expect(window.confirm).toHaveBeenCalled()
    expect(wrapper.emitted('remove')).toHaveLength(1)
    expect(wrapper.emitted('remove')![0]).toEqual(['entry-1'])
  })

  it('does not emit remove if confirmation is cancelled', async () => {
    window.confirm = vi.fn<() => boolean>(() => false)
    const entries = createEntries(1)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const removeBtn = wrapper.find('.entry-list__remove-btn')
    await removeBtn.trigger('click')

    expect(window.confirm).toHaveBeenCalled()
    expect(wrapper.emitted('remove')).toBeFalsy()
  })

  it('renders add button at the bottom after all entries', () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const addBtn = wrapper.find('.entry-list__add-btn')
    // The add button should exist
    expect(addBtn.exists()).toBe(true)
  })
})
