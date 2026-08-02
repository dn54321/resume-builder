import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import { useResumeStore } from '@/features/builder/stores/resume'
import StandardLayout from '@/features/builder/components/preview/StandardLayout.vue'

/**
 *
 */
function makeStore() {
  setActivePinia(createPinia())
  return useResumeStore()
}

describe('StandardLayout', () => {
  describe('empty state', () => {
    it('shows watermark when all sections are empty', () => {
      const store = makeStore()
      store.initializeDefaults()

      const wrapper = mount(StandardLayout, {
        props: {
          sections: store.sections,
        },
      })

      const watermark = wrapper.find('.standard-layout__watermark')
      expect(watermark.exists()).toBe(true)
      expect(watermark.text()).toBe('Your resume preview will appear here.')
    })

    it('shows watermark when sections array is empty', () => {
      const wrapper = mount(StandardLayout, {
        props: {
          sections: [],
        },
      })

      expect(wrapper.find('.standard-layout__watermark').exists()).toBe(true)
      expect(wrapper.find('.standard-layout__name-contact').exists()).toBe(false)
    })
  })

  describe('name_contact rendering', () => {
    it('renders full name prominently and contact details inline', () => {
      const store = makeStore()
      store.initializeDefaults()
      store.loadFromPayload({
        layout: 'standard',
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
                  { key: 'fullName', value: 'John Doe', order: 0 },
                  { key: 'email', value: 'john@example.com', order: 1 },
                  { key: 'phone', value: '(555) 123-4567', order: 2 },
                  { key: 'location', value: 'San Francisco, CA', order: 3 },
                  { key: 'linkedin', value: '', order: 4 },
                  { key: 'website', value: '', order: 5 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: {
          sections: store.sections,
        },
      })

      const name = wrapper.find('.standard-layout__name')
      expect(name.exists()).toBe(true)
      expect(name.text()).toBe('John Doe')

      const contactLine = wrapper.find('.standard-layout__contact-line')
      expect(contactLine.exists()).toBe(true)
      expect(contactLine.text()).toContain('john@example.com')
      expect(contactLine.text()).toContain('(555) 123-4567')
      expect(contactLine.text()).toContain('San Francisco, CA')
      // Pipes separate values
      expect(contactLine.text()).toMatch(/\|/)
    })

    it('shows "Your Name" placeholder when fullName is empty', () => {
      const store = makeStore()
      store.initializeDefaults()
      store.loadFromPayload({
        layout: 'standard',
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
                  { key: 'fullName', value: '', order: 0 },
                  { key: 'email', value: 'a@b.com', order: 1 },
                ],
              },
            ],
          },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const name = wrapper.find('.standard-layout__name')
      expect(name.text()).toBe('Your Name')
    })
  })

  describe('summary rendering', () => {
    it('renders summary heading and text', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'standard',
        sections: [
          {
            sectionId: 'summary',
            column: 'right',
            order: 0,
            entries: [
              {
                order: 0,
                parentId: null,
                fields: [{ key: 'text', value: 'A dedicated software engineer with 5 years of experience.', order: 0 }],
              },
            ],
          },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.find('.preview-section__heading')
      expect(heading.text()).toBe('Summary')
      expect(wrapper.text()).toContain('A dedicated software engineer with 5 years of experience.')
    })

    it('does not render summary section when text is empty', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'standard',
        sections: [
          {
            sectionId: 'summary',
            column: 'right',
            order: 0,
            entries: [{ order: 0, parentId: null, fields: [{ key: 'text', value: '', order: 0 }] }],
          },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      // Should show watermark since no non-empty sections
      expect(wrapper.find('.standard-layout__watermark').exists()).toBe(true)
    })
  })

  describe('experience rendering', () => {
    it('renders experience entries with company, title, dates, location, bullets via payload', () => {
      const store = makeStore()
      store.loadFromPayload({
        layout: 'standard',
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

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Experience')).toBe(true)
      expect(wrapper.find('.standard-layout__company').text()).toBe('Acme Corp')
      expect(wrapper.find('.standard-layout__experience-title').text()).toBe('Senior Engineer')
      expect(wrapper.find('.standard-layout__experience-location').text()).toBe('Remote')
    })

    it('renders company bold and dates right-aligned', () => {
      const store = makeStore()
      store.initializeDefaults()
      // Build experience section manually
      const expSection = store.sections.find((s) => s.sectionType === 'experience')!
      expSection.entries = []
      const parentId = 'exp-1'
      expSection.entries.push({
        id: parentId,
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
      })
      expSection.entries.push({
        id: 'b1',
        order: 0,
        parentId,
        fields: [{ key: 'text', value: 'Built microservices', order: 0 }],
      })
      expSection.entries.push({
        id: 'b2',
        order: 1,
        parentId,
        fields: [{ key: 'text', value: 'Led team of 5', order: 0 }],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Experience')).toBe(true)

      const company = wrapper.find('.standard-layout__company')
      expect(company.exists()).toBe(true)
      expect(company.text()).toBe('Acme Corp')

      const title = wrapper.find('.standard-layout__experience-title')
      expect(title.exists()).toBe(true)
      expect(title.text()).toBe('Senior Engineer')

      const location = wrapper.find('.standard-layout__experience-location')
      expect(location.exists()).toBe(true)
      expect(location.text()).toBe('Remote')

      const dates = wrapper.find('.standard-layout__dates')
      expect(dates.exists()).toBe(true)
      expect(dates.text()).toContain('Jan 2020')
      expect(dates.text()).toContain('Jun 2023')

      const bullets = wrapper.findAll('.preview-bullet-list__item')
      expect(bullets).toHaveLength(2)
      expect(bullets[0]!.text()).toBe('Built microservices')
      expect(bullets[1]!.text()).toBe('Led team of 5')
    })

    it('shows "Present" for current job', () => {
      const store = makeStore()
      store.initializeDefaults()
      const expSection = store.sections.find((s) => s.sectionType === 'experience')!
      expSection.entries = []
      expSection.entries.push({
        id: 'exp-1',
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
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const dates = wrapper.find('.standard-layout__dates')
      expect(dates.text()).toContain('Present')
      expect(dates.text()).toContain('Jan 2023')
    })
  })

  describe('education rendering', () => {
    it('renders school, degree, field of study, dates', () => {
      const store = makeStore()
      store.initializeDefaults()
      const eduSection = store.sections.find((s) => s.sectionType === 'education')!
      eduSection.entries = []
      eduSection.entries.push({
        id: 'edu-1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'school', value: 'MIT', order: 0 },
          { key: 'degree', value: 'Bachelor of Science', order: 1 },
          { key: 'fieldOfStudy', value: 'Computer Science', order: 2 },
          { key: 'startDate', value: '2016-09', order: 3 },
          { key: 'endDate', value: '2020-05', order: 4 },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Education')).toBe(true)

      const school = wrapper.find('.standard-layout__school')
      expect(school.text()).toBe('MIT')

      const degree = wrapper.find('.standard-layout__education-degree')
      expect(degree.text()).toContain('Bachelor of Science')
      expect(degree.text()).toContain('Computer Science')

      const dates = wrapper.find('.standard-layout__dates')
      expect(dates.text()).toContain('Sep 2016')
      expect(dates.text()).toContain('May 2020')
    })
  })

  describe('skills rendering', () => {
    it('renders hard skills as comma-separated list', () => {
      const store = makeStore()
      store.initializeDefaults()
      const skillSection = store.sections.find((s) => s.sectionType === 'hard_skills')!
      skillSection.entries = []
      skillSection.entries.push({
        id: 's1',
        order: 0,
        parentId: null,
        fields: [{ key: 'name', value: 'TypeScript', order: 0 }],
      })
      skillSection.entries.push({
        id: 's2',
        order: 1,
        parentId: null,
        fields: [{ key: 'name', value: 'Python', order: 0 }],
      })
      skillSection.entries.push({
        id: 's3',
        order: 2,
        parentId: null,
        fields: [{ key: 'name', value: 'Rust', order: 0 }],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const skills = wrapper.find('.standard-layout__skills-text')
      expect(skills.exists()).toBe(true)
      expect(skills.text()).toBe('TypeScript, Python, Rust')
    })

    it('renders soft skills as comma-separated list', () => {
      const store = makeStore()
      store.initializeDefaults()
      const skillSection = store.sections.find((s) => s.sectionType === 'soft_skills')!
      skillSection.entries = []
      skillSection.entries.push({
        id: 's1',
        order: 0,
        parentId: null,
        fields: [{ key: 'name', value: 'Communication', order: 0 }],
      })
      skillSection.entries.push({
        id: 's2',
        order: 1,
        parentId: null,
        fields: [{ key: 'name', value: 'Leadership', order: 0 }],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Soft Skills')).toBe(true)

      const skillsTexts = wrapper.findAll('.standard-layout__skills-text')
      const softText = skillsTexts.find((t) => t.text().includes('Communication'))
      expect(softText).toBeDefined()
      expect(softText!.text()).toBe('Communication, Leadership')
    })
  })

  describe('languages rendering', () => {
    it('renders languages with proficiency in parentheses', () => {
      const store = makeStore()
      store.initializeDefaults()
      const langSection = store.sections.find((s) => s.sectionType === 'languages')!
      langSection.entries = []
      langSection.entries.push({
        id: 'l1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'name', value: 'English', order: 0 },
          { key: 'proficiency', value: 'Native', order: 1 },
        ],
      })
      langSection.entries.push({
        id: 'l2',
        order: 1,
        parentId: null,
        fields: [
          { key: 'name', value: 'Spanish', order: 0 },
          { key: 'proficiency', value: 'Professional Working', order: 1 },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Languages')).toBe(true)

      const text = wrapper.find('.standard-layout__languages-text')
      expect(text.text()).toContain('English (Native)')
      expect(text.text()).toContain('Spanish (Professional Working)')
    })

    it('shows language name without proficiency when proficiency is empty', () => {
      const store = makeStore()
      store.initializeDefaults()
      const langSection = store.sections.find((s) => s.sectionType === 'languages')!
      langSection.entries = []
      langSection.entries.push({
        id: 'l1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'name', value: 'French', order: 0 },
          { key: 'proficiency', value: '', order: 1 },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const text = wrapper.find('.standard-layout__languages-text')
      expect(text.text()).toBe('French')
    })
  })

  describe('certifications rendering', () => {
    it('renders certification name, issuer, date', () => {
      const store = makeStore()
      store.initializeDefaults()
      const certSection = store.sections.find((s) => s.sectionType === 'certifications')!
      certSection.entries = []
      certSection.entries.push({
        id: 'c1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'name', value: 'AWS Solutions Architect', order: 0 },
          { key: 'issuer', value: 'Amazon Web Services', order: 1 },
          { key: 'date', value: '2022-03', order: 2 },
        ],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Certifications')).toBe(true)

      const certText = wrapper.find('.standard-layout__cert-name')
      expect(certText.text()).toContain('AWS Solutions Architect')
      expect(certText.text()).toContain('Amazon Web Services')
      expect(certText.text()).toContain('Mar 2022')
    })
  })

  describe('projects rendering', () => {
    it('renders project name bold, description, URL, bullets', () => {
      const store = makeStore()
      store.initializeDefaults()
      const projSection = store.sections.find((s) => s.sectionType === 'projects')!
      projSection.entries = []
      projSection.entries.push({
        id: 'p1',
        order: 0,
        parentId: null,
        fields: [
          { key: 'name', value: 'My Project', order: 0 },
          { key: 'description', value: 'A cool project about things', order: 1 },
          { key: 'url', value: 'https://github.com/user/project', order: 2 },
          { key: 'startDate', value: '2023-01', order: 3 },
          { key: 'endDate', value: '2023-06', order: 4 },
        ],
      })
      projSection.entries.push({
        id: 'pb1',
        order: 0,
        parentId: 'p1',
        fields: [{ key: 'text', value: 'Implemented feature X', order: 0 }],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Projects')).toBe(true)

      const name = wrapper.find('.standard-layout__project-name')
      expect(name.text()).toContain('My Project')

      const desc = wrapper.find('.standard-layout__project-description')
      expect(desc.text()).toBe('A cool project about things')

      const url = wrapper.find('.standard-layout__project-url')
      expect(url.text()).toBe('https://github.com/user/project')

      const bullets = wrapper.findAll('.preview-bullet-list__item')
      expect(bullets).toHaveLength(1)
      expect(bullets[0]!.text()).toBe('Implemented feature X')
    })
  })

  describe('hobbies rendering', () => {
    it('renders hobbies as comma-separated list', () => {
      const store = makeStore()
      store.initializeDefaults()
      const hobbySection = store.sections.find((s) => s.sectionType === 'hobbies')!
      hobbySection.entries = []
      hobbySection.entries.push({
        id: 'h1',
        order: 0,
        parentId: null,
        fields: [{ key: 'name', value: 'Photography', order: 0 }],
      })
      hobbySection.entries.push({
        id: 'h2',
        order: 1,
        parentId: null,
        fields: [{ key: 'name', value: 'Rock Climbing', order: 0 }],
      })

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const heading = wrapper.findAll('.preview-section__heading')
      expect(heading.some((h) => h.text() === 'Hobbies')).toBe(true)

      const texts = wrapper.findAll('.standard-layout__skills-text')
      const hobbyText = texts.find((t) => t.text().includes('Photography'))
      expect(hobbyText).toBeDefined()
      expect(hobbyText!.text()).toBe('Photography, Rock Climbing')
    })
  })

  describe('section ordering', () => {
    it('renders sections in their defined order', () => {
      const store = makeStore()
      store.initializeDefaults()
      // Set up two sections with data
      const skillSection = store.sections.find((s) => s.sectionType === 'hard_skills')!
      skillSection.entries = []
      skillSection.order = 0
      skillSection.entries.push({ id: 's1', order: 0, parentId: null, fields: [{ key: 'name', value: 'TS', order: 0 }] })

      const hobbySection = store.sections.find((s) => s.sectionType === 'hobbies')!
      hobbySection.entries = []
      hobbySection.order = 1
      hobbySection.entries.push({ id: 'h1', order: 0, parentId: null, fields: [{ key: 'name', value: 'Running', order: 0 }] })

      // Only these two have data
      store.sections = [skillSection, hobbySection]

      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      const headings = wrapper.findAll('.preview-section__heading')
      expect(headings[0]!.text()).toBe('Hard Skills')
      expect(headings[1]!.text()).toBe('Hobbies')
    })
  })

  describe('empty sections are not rendered', () => {
    it('skips sections with no entries or empty values', () => {
      const store = makeStore()
      store.initializeDefaults()
      // All defaults have empty entries, so should show watermark
      const wrapper = mount(StandardLayout, {
        props: { sections: store.sections },
      })

      expect(wrapper.find('.standard-layout__watermark').exists()).toBe(true)
      expect(wrapper.findAll('.preview-section__heading')).toHaveLength(0)
    })
  })
})
