<template>
  <div class="two-column-layout">
    <!-- Empty state watermark -->
    <div v-if="isEmpty" class="two-column-layout__watermark">
      Your resume preview will appear here.
    </div>

    <!-- Two-column grid -->
    <div v-else class="two-column-layout__grid">
      <!-- Left Column -->
      <div class="two-column-layout__left">
        <template v-for="section in leftSections" :key="section.sectionId">
          <component :is="getSectionRenderer(section.sectionType)" :section="section" :name="name" />
        </template>
      </div>

      <!-- Right Column -->
      <div class="two-column-layout__right">
        <template v-for="section in rightSections" :key="section.sectionId">
          <component :is="getSectionRenderer(section.sectionType)" :section="section" :name="name" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue'
import PreviewSection from './PreviewSection.vue'
import PreviewBulletList from './PreviewBulletList.vue'
import type { ResumeSectionState, SectionEntryState, SectionType } from '@/features/builder/types/resume'

const props = defineProps<{
  sections: ResumeSectionState[]
  name: string
}>()

/**
 * Determine if the entire resume is empty (no sections with any data).
 */
const isEmpty = computed(() => {
  return nonEmptySections.value.length === 0
})

/**
 * Filter and sort enabled sections that have actual data.
 */
const nonEmptySections = computed(() => {
  return props.sections
    .filter((s) => isSectionNonEmpty(s))
    .sort((a, b) => a.order - b.order)
})

const leftSections = computed(() =>
  nonEmptySections.value.filter((s) => s.column === 'left'),
)

const rightSections = computed(() =>
  nonEmptySections.value.filter((s) => s.column === 'right'),
)

// ─── Section empty check ───

/**
 * Check whether a section has any non-empty data that should be rendered.
 * @param section - The section to check.
 * @returns `true` if the section has any visible content.
 */
function isSectionNonEmpty(section: ResumeSectionState): boolean {
  const entries = section.entries.filter((e) => !e.parentId)
  if (entries.length === 0) return false

  if (section.sectionType === 'name_contact') {
    return entries.some((e) =>
      e.fields.some((f) => f.value.trim().length > 0),
    )
  }

  if (section.sectionType === 'summary') {
    return entries.some((e) =>
      e.fields.some((f) => f.key === 'text' && f.value.trim().length > 0),
    )
  }

  // For all other multi-entry types, at least one entry must have some value
  return entries.some((e) =>
    e.fields.some((f) => f.value.trim().length > 0),
  )
}

// ─── Field helpers ───

/**
 * Get top-level entries (no parent) from a section, sorted by order.
 * @param section - The section to extract entries from.
 * @returns Sorted array of top-level entries.
 */
function topLevelEntries(section: ResumeSectionState): SectionEntryState[] {
  return section.entries
    .filter((e) => !e.parentId)
    .sort((a, b) => a.order - b.order)
}

/**
 * Get the string value of a field by its key for a specific entry.
 * @param section - The section containing the entry.
 * @param entryId - ID of the entry to look up.
 * @param key - The field key to retrieve.
 * @returns The field value string, or empty string if not found.
 */
function fieldValue(section: ResumeSectionState, entryId: string, key: string): string {
  const entry = section.entries.find((e) => e.id === entryId)
  if (!entry) return ''
  return entry.fields.find((f) => f.key === key)?.value ?? ''
}

/**
 * Format a YYYY-MM month string to human-readable "Mon YYYY" form.
 * @param monthStr - Month string in YYYY-MM format.
 * @returns Formatted string like "Jan 2020", or the original string if unparseable.
 */
function formatMonth(monthStr: string): string {
  if (!monthStr) return ''
  const parts = monthStr.split('-')
  if (parts.length !== 2) return monthStr
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthIndex = parseInt(parts[1]!, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return monthStr
  return `${months[monthIndex]} ${parts[0]}`
}

/**
 * Format a date range string (e.g., "Jan 2020 – Present").
 * @param section - The section containing the entry.
 * @param entryId - ID of the entry with date fields.
 * @returns Formatted date range string, or empty string.
 */
function formatDateRange(section: ResumeSectionState, entryId: string): string {
  const start = fieldValue(section, entryId, 'startDate')
  const end = fieldValue(section, entryId, 'endDate')
  const isCurrent = fieldValue(section, entryId, 'isCurrent') === 'true'

  const startFormatted = start ? formatMonth(start) : ''
  let endFormatted = ''
  if (isCurrent) {
    endFormatted = 'Present'
  } else if (end) {
    endFormatted = formatMonth(end)
  }

  if (startFormatted && endFormatted) return `${startFormatted} \u2013 ${endFormatted}`
  if (startFormatted) return startFormatted
  if (endFormatted) return endFormatted
  return ''
}

/**
 * Build a comma-separated list from the 'name' fields of top-level entries.
 * @param section - The section to read from.
 * @returns Comma-separated string of names.
 */
function commaList(section: ResumeSectionState): string {
  return topLevelEntries(section)
    .map((e) => fieldValue(section, e.id, 'name'))
    .filter((v) => v.trim().length > 0)
    .join(', ')
}

/**
 * Extract bullet point entries for a parent entry (e.g., experience or project).
 * @param section - The section containing the entries.
 * @param parentId - ID of the parent entry.
 * @returns Array of non-empty bullet objects with id and value.
 */
function entryBullets(section: ResumeSectionState, parentId: string) {
  return section.entries
    .filter((e) => e.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((e) => ({
      id: e.id,
      value: e.fields.find((f) => f.key === 'text')?.value ?? '',
    }))
    .filter((b) => b.value.trim().length > 0)
}

// ─── Section renderers ───
// Each returns a VNode tree for the given section, avoiding a giant conditional template.

/**
 * Get the render function component for a given section type.
 * @param sectionType - The type of section to render.
 * @returns A defineComponent that renders the section, or a default empty component.
 */
function getSectionRenderer(sectionType: SectionType): ReturnType<typeof defineComponent> {
  return sectionRenderers[sectionType] ?? sectionRenderers.default!
}

const sectionRenderers: Record<string, ReturnType<typeof defineComponent>> = {
  default: defineComponent({
    props: { section: Object, name: String },
    setup() {
      return () => h('div')
    },
  }),

  name_contact: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const entry = computed(() => section.entries[0])

      const contactKeys = ['email', 'phone', 'location', 'linkedin', 'website'] as const

      const contactDetails = computed(() => {
        const e = entry.value
        if (!e) return []
        return contactKeys
          .filter((k) => {
            const f = e.fields.find((ff) => ff.key === k)
            return f && f.value.trim().length > 0
          })
          .map((k) => ({
            key: k,
            value: e.fields.find((ff) => ff.key === k)!.value,
          }))
      })

      const fullName = computed(() => {
        const e = entry.value
        if (!e) return ''
        return e.fields.find((f) => f.key === 'fullName')?.value || 'Your Name'
      })

      return () =>
        h('div', { class: 'two-col-name-contact' }, [
          h('h1', { class: 'two-col-name' }, fullName.value),
          h(
            'p',
            { class: 'two-col-contact-line' },
            contactDetails.value.flatMap((d, i) => {
              const els: ReturnType<typeof h>[] = []
              if (i > 0) els.push(h('span', { class: 'two-col-pipe' }, '|'))
              els.push(h('span', d.value))
              return els
            }),
          ),
        ])
    },
  }),

  summary: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => {
        const e = section.entries[0]
        if (!e) return ''
        return e.fields.find((f) => f.key === 'text')?.value ?? ''
      })
      return () =>
        h(PreviewSection, { heading: 'Summary' }, () =>
          h('p', { class: 'two-col-body-text' }, text.value),
        )
    },
  }),

  experience: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const entries = computed(() =>
        section.entries
          .filter((e) => !e.parentId)
          .sort((a, b) => a.order - b.order),
      )
      return () =>
        h(PreviewSection, { heading: 'Experience' }, () =>
          entries.value.map((entry) => {
            const bullets = entryBullets(section, entry.id)
            return h('div', { class: 'two-col-entry', key: entry.id }, [
              h('div', { class: 'two-col-entry-header' }, [
                h('span', { class: 'two-col-bold' }, fieldValue(section, entry.id, 'company')),
                h('span', { class: 'two-col-dates' }, formatDateRange(section, entry.id)),
              ]),
              fieldValue(section, entry.id, 'title')
                ? h('p', { class: 'two-col-italic' }, fieldValue(section, entry.id, 'title'))
                : null,
              fieldValue(section, entry.id, 'location')
                ? h('p', { class: 'two-col-location' }, fieldValue(section, entry.id, 'location'))
                : null,
              bullets.length > 0 ? h(PreviewBulletList, { bullets }) : null,
            ])
          }),
        )
    },
  }),

  education: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const entries = computed(() =>
        section.entries
          .filter((e) => !e.parentId)
          .sort((a, b) => a.order - b.order),
      )
      return () =>
        h(PreviewSection, { heading: 'Education' }, () =>
          entries.value.map((entry) => {
            const degree = fieldValue(section, entry.id, 'degree')
            const fieldOfStudy = fieldValue(section, entry.id, 'fieldOfStudy')
            const degreeLine = [degree, fieldOfStudy].filter(Boolean).join(', ')
            return h('div', { class: 'two-col-entry', key: entry.id }, [
              h('div', { class: 'two-col-entry-header' }, [
                h('span', { class: 'two-col-bold' }, fieldValue(section, entry.id, 'school')),
                h('span', { class: 'two-col-dates' }, formatDateRange(section, entry.id)),
              ]),
              degreeLine
                ? h('p', { class: 'two-col-body-text' }, degreeLine)
                : null,
            ])
          }),
        )
    },
  }),

  hard_skills: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => commaList(section))
      return () =>
        h(PreviewSection, { heading: 'Hard Skills' }, () =>
          h('p', { class: 'two-col-body-text' }, text.value),
        )
    },
  }),

  soft_skills: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => commaList(section))
      return () =>
        h(PreviewSection, { heading: 'Soft Skills' }, () =>
          h('p', { class: 'two-col-body-text' }, text.value),
        )
    },
  }),

  projects: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const entries = computed(() =>
        section.entries
          .filter((e) => !e.parentId)
          .sort((a, b) => a.order - b.order),
      )
      return () =>
        h(PreviewSection, { heading: 'Projects' }, () =>
          entries.value.map((entry) => {
            const bullets = entryBullets(section, entry.id)
            const name = fieldValue(section, entry.id, 'name')
            const dr = formatDateRange(section, entry.id)
            return h('div', { class: 'two-col-entry', key: entry.id }, [
              h('p', { class: 'two-col-body-text' }, [
                h('strong', name),
                dr ? [' | ', h('span', { class: 'two-col-dates' }, dr)] : null,
              ]),
              fieldValue(section, entry.id, 'description')
                ? h('p', { class: 'two-col-body-text' }, fieldValue(section, entry.id, 'description'))
                : null,
              fieldValue(section, entry.id, 'url')
                ? h('p', { class: 'two-col-url' }, fieldValue(section, entry.id, 'url'))
                : null,
              bullets.length > 0 ? h(PreviewBulletList, { bullets }) : null,
            ])
          }),
        )
    },
  }),

  certifications: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const entries = computed(() =>
        section.entries
          .filter((e) => !e.parentId)
          .sort((a, b) => a.order - b.order),
      )
      return () =>
        h(PreviewSection, { heading: 'Certifications' }, () =>
          entries.value.map((entry) => {
            const nameVal = fieldValue(section, entry.id, 'name')
            const issuer = fieldValue(section, entry.id, 'issuer')
            const date = fieldValue(section, entry.id, 'date')
            return h('p', { class: 'two-col-body-text', key: entry.id }, [
              h('strong', nameVal),
              issuer ? ` \u2014 ${issuer}` : '',
              date ? ` | ${formatMonth(date)}` : '',
            ])
          }),
        )
    },
  }),

  languages: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => {
        return topLevelEntries(section)
          .map((e) => {
            const nameVal = fieldValue(section, e.id, 'name').trim()
            const prof = fieldValue(section, e.id, 'proficiency').trim()
            if (!nameVal) return ''
            return prof ? `${nameVal} (${prof})` : nameVal
          })
          .filter((v) => v.length > 0)
          .join(', ')
      })
      return () =>
        h(PreviewSection, { heading: 'Languages' }, () =>
          h('p', { class: 'two-col-body-text' }, text.value),
        )
    },
  }),

  hobbies: defineComponent({
    props: { section: Object as () => ResumeSectionState, name: String },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => commaList(section))
      return () =>
        h(PreviewSection, { heading: 'Hobbies' }, () =>
          h('p', { class: 'two-col-body-text' }, text.value),
        )
    },
  }),
}
</script>

<style scoped>
.two-column-layout {
  padding: 48pt 48pt 36pt 48pt;
  min-height: 960pt;
}

.two-column-layout__watermark {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 600pt;
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 16pt;
  color: #9ca3af;
  font-style: italic;
  user-select: none;
}

.two-column-layout__grid {
  display: flex;
  gap: 20pt;
  align-items: flex-start;
}

.two-column-layout__left {
  width: 33.333%;
  flex-shrink: 0;
}

.two-column-layout__right {
  flex: 1;
  min-width: 0;
}

/* ─── Name & Contact ─── */

.two-col-name-contact {
  text-align: left;
  margin-bottom: 14pt;
}

.two-col-name {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 18pt;
  font-weight: 700;
  color: #000;
  margin: 0 0 4pt;
}

.two-col-contact-line {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  color: #000;
  margin: 0;
  line-height: 1.4;
}

.two-col-pipe {
  margin: 0 6pt;
}

/* ─── Shared entry styles ─── */

.two-col-entry {
  margin-bottom: 8pt;
}

.two-col-entry-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.two-col-bold {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  font-weight: 700;
  color: #000;
}

.two-col-dates {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  color: #333;
  white-space: nowrap;
}

.two-col-italic {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  font-style: italic;
  color: #000;
  margin: 1pt 0 0;
}

.two-col-location {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  color: #333;
  margin: 1pt 0 0;
}

.two-col-body-text {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  color: #000;
  margin: 0;
  line-height: 1.4;
}

.two-col-url {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
  font-size: 10pt;
  color: #333;
  margin: 2pt 0 0;
  word-break: break-all;
}
</style>
