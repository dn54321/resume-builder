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

    const panels = wrapper.findAll('[data-entry-panel]')
    expect(panels).toHaveLength(2)
    // The title span is the flex-1 span in the header
    const titleSpans = panels.map((panel) =>
      panel.find('span.flex-1'),
    )
    expect(titleSpans[0]!.text()).toBe('Entry entry-1')
    expect(titleSpans[1]!.text()).toBe('Entry entry-2')
  })

  it('renders add button with the correct label', () => {
    const wrapper = mount(EntryList, {
      props: { entries: [], addLabel: 'Add Job', entryTitle },
    })

    // The add button is the last button in the component
    const buttons = wrapper.findAll('button')
    const addBtn = buttons[buttons.length - 1]
    expect(addBtn.exists()).toBe(true)
    expect(addBtn.text()).toBe('+ Add Job')
  })

  it('starts with all entries collapsed', () => {
    const entries = createEntries(3)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    // Expanded body panels have class 'p-3 border-t'
    const bodies = wrapper.findAll('.p-3.border-t')
    expect(bodies).toHaveLength(0)
  })

  it('expands an entry when its header is clicked', async () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    // Find the first entry panel's header (the div with cursor-pointer)
    const panels = wrapper.findAll('[data-entry-panel]')
    const header = panels[0]!.find('[class*="cursor-pointer"]')
    await header.trigger('click')

    const bodies = wrapper.findAll('.p-3.border-t')
    expect(bodies).toHaveLength(1)
  })

  it('collapses an expanded entry when clicked again', async () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const panels = wrapper.findAll('[data-entry-panel]')
    const header = panels[0]!.find('[class*="cursor-pointer"]')
    // Expand
    await header.trigger('click')
    expect(wrapper.findAll('.p-3.border-t')).toHaveLength(1)
    // Collapse
    await header.trigger('click')
    expect(wrapper.findAll('.p-3.border-t')).toHaveLength(0)
  })

  it('auto-expands a newly added entry', async () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    // Initially all collapsed
    expect(wrapper.findAll('.p-3.border-t')).toHaveLength(0)

    // Simulate adding a new entry by updating props
    const newEntries = [...entries, { id: 'entry-3', order: 2 }]
    await wrapper.setProps({ entries: newEntries })
    await nextTick()

    // The new entry (last one) should be expanded
    const bodies = wrapper.findAll('.p-3.border-t')
    expect(bodies).toHaveLength(1)

    // The third panel should have an expanded body
    const panels = wrapper.findAll('[data-entry-panel]')
    expect(panels).toHaveLength(3)
    expect(panels[2]!.find('.p-3.border-t').exists()).toBe(true)
  })

  it('emits add event when add button is clicked', async () => {
    const wrapper = mount(EntryList, {
      props: { entries: [], addLabel: 'Add Job', entryTitle },
    })

    // The add button is the only button (when entries is empty)
    const addBtn = wrapper.find('button')
    await addBtn.trigger('click')
    expect(wrapper.emitted('add')).toHaveLength(1)
  })

  it('emits remove event after confirmation', async () => {
    window.confirm = vi.fn<() => boolean>(() => true)
    const entries = createEntries(1)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    const removeBtn = wrapper.find('button[title="Remove entry"]')
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

    const removeBtn = wrapper.find('button[title="Remove entry"]')
    await removeBtn.trigger('click')

    expect(window.confirm).toHaveBeenCalled()
    expect(wrapper.emitted('remove')).toBeFalsy()
  })

  it('renders add button at the bottom after all entries', () => {
    const entries = createEntries(2)
    const wrapper = mount(EntryList, {
      props: { entries, addLabel: 'Add Item', entryTitle },
    })

    // The add button is the last button element
    const buttons = wrapper.findAll('button')
    const addBtn = buttons[buttons.length - 1]
    expect(addBtn.exists()).toBe(true)
    // Verify it's the add button by checking text starts with '+'
    expect(addBtn.text()).toContain('+')
  })
})
