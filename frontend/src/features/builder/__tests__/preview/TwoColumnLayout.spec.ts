import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import TwoColumnLayout from '@/features/builder/components/preview/TwoColumnLayout.vue'

/**
 *
 */
function makeStore() {
  setActivePinia(createPinia())
  return useResumeStore()
}

describe('TwoColumnLayout', () => {
  describe('empty state', () => {
    it('shows watermark when all sections are empty', () => {
      const store = makeStore()
      store.initializeDefaults()

      const wrapper = mount(TwoColumnLayout, {
        props: {
          sections: store.sections,
        },
      })

      const watermark = wrapper.find('.two-column-layout__watermark')
      expect(watermark.exists()).toBe(true)
      expect(watermark.text()).toBe('Your resume preview will appear here.')
    })

    it('shows watermark when sections array is empty', () => {
      const wrapper = mount(TwoColumnLayout, {
        props: {
          sections: [],
        },
      })

      expect(wrapper.find('.two-column-layout__watermark').exists()).toBe(true)
    })
  })

  describe('column distribution', () => {
    it('renders sections in left and right columns based on column assignment', () => {
      const store = makeStore()
      // Summary in left, Experience in right
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'summary',
            column: 'left',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'text', value: 'A software engineer with 5 years of experience.', order: 0 }],
              },
            ],
          },
          {
            sectionId: 'experience',
            column: 'right',
            order: 1,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'company', value: 'Acme Corp', order: 0 },
                  { key: 'title', value: 'Senior Engineer', order: 1 },
                  { key: 'startDate', value: '2020-01', order: 2 },
                  { key: 'endDate', value: '', order: 3 },
                  { key: 'location', value: 'Remote', order: 4 },
                  { key: 'isCurrent', value: 'true', order: 5 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      // Both columns should exist
      const leftCol = wrapper.find('.two-column-layout__left')
      const rightCol = wrapper.find('.two-column-layout__right')
      expect(leftCol.exists()).toBe(true)
      expect(rightCol.exists()).toBe(true)

      // Summary heading should be in left column
      expect(leftCol.text()).toContain('Summary')
      // Experience heading should be in right column
      expect(rightCol.text()).toContain('Experience')
    })
  })

  describe('name_contact rendering', () => {
    it('renders full name and contact details inline', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'name_contact',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'fullName', value: 'Jane Smith', order: 0 },
                  { key: 'email', value: 'jane@example.com', order: 1 },
                  { key: 'phone', value: '(555) 987-6543', order: 2 },
                  { key: 'location', value: 'New York, NY', order: 3 },
                  { key: 'linkedin', value: '', order: 4 },
                  { key: 'website', value: '', order: 5 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const name = wrapper.find('.two-col-name')
      expect(name.exists()).toBe(true)
      expect(name.text()).toBe('Jane Smith')

      const contactLine = wrapper.find('.two-col-contact-line')
      expect(contactLine.exists()).toBe(true)
      expect(contactLine.text()).toContain('jane@example.com')
      expect(contactLine.text()).toContain('(555) 987-6543')
      expect(contactLine.text()).toContain('New York, NY')
      expect(contactLine.text()).toMatch(/\|/)
    })
  })

  describe('summary rendering', () => {
    it('renders summary heading and text', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'summary',
            column: 'left',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'text', value: 'Experienced full-stack developer.', order: 0 }],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.find('.preview-section__heading')
      expect(heading.text()).toBe('Summary')
      expect(wrapper.text()).toContain('Experienced full-stack developer.')
    })

    it('does not render summary section when text is empty', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'summary',
            column: 'left',
            order: 0,
            entries: [{ order: 0, parentId: null, fields: [{ key: 'text', value: '', order: 0 }] }],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      expect(wrapper.find('.two-column-layout__watermark').exists()).toBe(true)
    })
  })

  describe('experience rendering', () => {
    it('renders experience entries with company, title, dates, location, bullets', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'company', value: 'Acme Corp', order: 0 },
                  { key: 'title', value: 'Senior Engineer', order: 1 },
                  { key: 'startDate', value: '2020-01', order: 2 },
                  { key: 'endDate', value: '2023-06', order: 3 },
                  { key: 'location', value: 'Remote', order: 4 },
                  { key: 'isCurrent', value: 'false', order: 5 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Experience')).toBe(true)
      expect(wrapper.find('.two-col-bold').text()).toBe('Acme Corp')
    })

    it('shows "Present" for current job', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'experience',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'company', value: 'Startup Inc', order: 0 },
                  { key: 'title', value: 'CTO', order: 1 },
                  { key: 'startDate', value: '2023-01', order: 2 },
                  { key: 'endDate', value: '', order: 3 },
                  { key: 'location', value: '', order: 4 },
                  { key: 'isCurrent', value: 'true', order: 5 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const dates = wrapper.find('.two-col-dates')
      expect(dates.text()).toContain('Present')
      expect(dates.text()).toContain('Jan 2023')
    })
  })

  describe('education rendering', () => {
    it('renders school, degree, field of study, dates', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'education',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'school', value: 'MIT', order: 0 },
                  { key: 'degree', value: 'BS', order: 1 },
                  { key: 'fieldOfStudy', value: 'CS', order: 2 },
                  { key: 'startDate', value: '2016-09', order: 3 },
                  { key: 'endDate', value: '2020-05', order: 4 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Education')).toBe(true)

      const school = wrapper.find('.two-col-bold')
      expect(school.text()).toBe('MIT')
    })
  })

  describe('skills rendering', () => {
    it('renders hard skills as comma-separated list', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'hard_skills',
            column: 'left',
            order: 0,
            entries: [
              { order: 0, parentId: null, fields: [{ key: 'name', value: 'TypeScript', order: 0 }] },
              { order: 1, parentId: null, fields: [{ key: 'name', value: 'Python', order: 0 }] },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Hard Skills')).toBe(true)

      const left = wrapper.find('.two-column-layout__left')
      expect(left.text()).toContain('TypeScript')
      expect(left.text()).toContain('Python')
    })
  })

  describe('languages rendering', () => {
    it('renders languages with proficiency in parentheses', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'languages',
            column: 'left',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'name', value: 'English', order: 0 },
                  { key: 'proficiency', value: 'Native', order: 1 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const left = wrapper.find('.two-column-layout__left')
      expect(left.text()).toContain('English (Native)')
    })
  })

  describe('certifications rendering', () => {
    it('renders certification name, issuer, date', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'certifications',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'name', value: 'AWS Solutions Architect', order: 0 },
                  { key: 'issuer', value: 'Amazon', order: 1 },
                  { key: 'date', value: '2022-03', order: 2 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const right = wrapper.find('.two-column-layout__right')
      expect(right.text()).toContain('AWS Solutions Architect')
      expect(right.text()).toContain('Amazon')
      expect(right.text()).toContain('Mar 2022')
    })
  })

  describe('projects rendering', () => {
    it('renders project name bold, description, URL, bullets', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'projects',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [
                  { key: 'name', value: 'My Project', order: 0 },
                  { key: 'description', value: 'A cool project', order: 1 },
                  { key: 'url', value: 'https://github.com/user/project', order: 2 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Projects')).toBe(true)

      const right = wrapper.find('.two-column-layout__right')
      expect(right.text()).toContain('My Project')
      expect(right.text()).toContain('A cool project')
      expect(right.text()).toContain('https://github.com/user/project')
    })
  })

  describe('hobbies rendering', () => {
    it('renders hobbies as comma-separated list', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'column2-1',
        sections: [
          {
            sectionId: 'hobbies',
            column: 'left',
            order: 0,
            entries: [
              { order: 0, parentId: null, fields: [{ key: 'name', value: 'Photography', order: 0 }] },
              { order: 1, parentId: null, fields: [{ key: 'name', value: 'Rock Climbing', order: 0 }] },
            ],
          },
        ],
      })

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Hobbies')).toBe(true)

      const left = wrapper.find('.two-column-layout__left')
      expect(left.text()).toContain('Photography')
      expect(left.text()).toContain('Rock Climbing')
    })
  })

  describe('empty sections are not rendered', () => {
    it('skips sections with no entries or empty values', () => {
      const store = makeStore()
      store.initializeDefaults()

      const wrapper = mount(TwoColumnLayout, {
        props: { sections: store.sections },
      })

      expect(wrapper.find('.two-column-layout__watermark').exists()).toBe(true)
      expect(wrapper.findAll('.preview-section__heading')).toHaveLength(0)
    })
  })
})
