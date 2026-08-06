import { describe, it, expect, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import ProjectsEditor from '@/features/builder/components/editors/ProjectsEditor.vue'

/**
 * Helper: expand all collapsed entry panels by clicking their headers.
 * @param {ReturnType<typeof mount>} wrapper - The mounted component wrapper.
 */
async function expandAllEntries(wrapper: ReturnType<typeof mount>): Promise<void> {
  const headers = wrapper.findAll('.bg-muted\\/20')
  for (const header of headers) {
    await header.trigger('click')
  }
  await flushPromises()
}

describe('ProjectsEditor', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    const store = useResumeStore()
    store.initializeDefaults()
  })

  it('renders the heading and add button', () => {
    const wrapper = mount(ProjectsEditor)
    expect(wrapper.text()).toContain('Projects')
    expect(wrapper.text()).toContain('Add Project')
  })

  it('adds a project entry with default empty fields', async () => {
    const wrapper = mount(ProjectsEditor)
    const addButton = wrapper.find('button')
    await addButton.trigger('click')
    await flushPromises()

    const store = useResumeStore()
    const section = store.sections.find((s) => s.sectionType === 'projects')
    expect(section).toBeDefined()
    expect(section!.entries.filter((e) => !e.parentId)).toHaveLength(1)

    const entry = section!.entries[0]!
    const fieldKeys = entry.fields.map((f) => f.key)
    expect(fieldKeys).toEqual(['name', 'description', 'url', 'startDate', 'endDate'])
  })

  describe('bullet visibility/lock toggles (RES-106 refined)', () => {
    /**
     * Mount with one project that has two bullets.
     */
    function mountWithBullets() {
      const store = useResumeStore()
      const section = store.sections.find((s) => s.sectionType === 'projects')!
      section.entries = [
        {
          id: 'proj-1',
          order: 0,
          parentId: null,
          locked: false,
          visible: true,
          fields: [
            { key: 'name', value: 'API Gateway', order: 0 },
            { key: 'description', value: '', order: 1 },
            { key: 'url', value: '', order: 2 },
            { key: 'startDate', value: '', order: 3 },
            { key: 'endDate', value: '', order: 4 },
          ],
        },
        {
          id: 'b1',
          order: 0,
          parentId: 'proj-1',
          locked: false,
          visible: true,
          fields: [{ key: 'text', value: 'Bullet 1', order: 0 }],
        },
        {
          id: 'b2',
          order: 1,
          parentId: 'proj-1',
          locked: true,
          visible: false,
          fields: [{ key: 'text', value: 'Bullet 2', order: 0 }],
        },
      ]
      return { store, section }
    }

    it('shows eye+lock toggles on bullet rows, not on the parent row', async () => {
      mountWithBullets()
      const wrapper = mount(ProjectsEditor)
      await expandAllEntries(wrapper)

      expect(wrapper.findAll('[data-testid="bullet-eye-toggle"]')).toHaveLength(2)
      expect(wrapper.findAll('[data-testid="bullet-lock-toggle"]')).toHaveLength(2)
      // Parent (project) rows carry NO per-entry toggles (refined spec).
      expect(wrapper.findAll('[data-testid="entry-eye-toggle"]')).toHaveLength(0)
      expect(wrapper.findAll('[data-testid="entry-lock-toggle"]')).toHaveLength(0)

      // b1 visible+unlocked → Eye + LockOpen; b2 hidden+locked → EyeOff + Lock.
      expect(wrapper.findAll('svg.lucide-eye')).toHaveLength(1)
      expect(wrapper.findAll('svg.lucide-eye-off')).toHaveLength(1)
      expect(wrapper.findAll('svg.lucide-lock')).toHaveLength(1)
      expect(wrapper.findAll('svg.lucide-lock-open')).toHaveLength(1)
    })

    it('toggles a bullet visible flag when its eye button is clicked', async () => {
      const { section } = mountWithBullets()
      const wrapper = mount(ProjectsEditor)
      await expandAllEntries(wrapper)

      const eyeButtons = wrapper.findAll('[data-testid="bullet-eye-toggle"]')
      await eyeButtons[0]!.trigger('click')

      expect(section.entries.find((e) => e.id === 'b1')!.visible).toBe(false)
      expect(section.entries.find((e) => e.id === 'b2')!.visible).toBe(false)
    })

    it('toggles a bullet locked flag when its lock button is clicked', async () => {
      const { section } = mountWithBullets()
      const wrapper = mount(ProjectsEditor)
      await expandAllEntries(wrapper)

      const lockButtons = wrapper.findAll('[data-testid="bullet-lock-toggle"]')
      await lockButtons[0]!.trigger('click')

      expect(section.entries.find((e) => e.id === 'b1')!.locked).toBe(true)
      expect(section.entries.find((e) => e.id === 'b2')!.locked).toBe(true)
    })
  })
})
