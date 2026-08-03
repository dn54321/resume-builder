<template>
  <div class="two-column-layout p-[48pt] pb-[36pt] min-h-[960pt]">
    <!-- Empty state watermark -->
    <div v-if="isEmpty" class="two-column-layout__watermark flex items-center justify-center min-h-[600pt] text-[16pt] text-neutral-400 italic select-none">
      Your resume preview will appear here.
    </div>

    <!-- Two-column grid -->
    <div v-else class="two-column-layout__grid flex gap-[20pt] items-start">
      <!-- Left Column -->
      <div class="two-column-layout__left w-1/3 shrink-0">
        <template v-for="section in leftSections" :key="section.sectionId">
          <component :is="getSectionRenderer(section.sectionType)" :section="section" />
        </template>
      </div>

      <!-- Right Column -->
      <div class="two-column-layout__right flex-1 min-w-0">
        <template v-for="section in rightSections" :key="section.sectionId">
          <component :is="getSectionRenderer(section.sectionType)" :section="section" />
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
    .filter((s) => s.enabled !== false)
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
// Tailwind classes added alongside BEM class names for styling.

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
    props: { section: Object },
    setup() {
      return () => h('div')
    },
  }),

  name_contact: defineComponent({
    props: { section: Object as () => ResumeSectionState },
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
        h('div', { class: 'two-col-name-contact text-left mb-[14pt]' }, [
          h('h1', { class: 'two-col-name text-[18pt] font-bold text-black m-0 mb-[4pt]' }, fullName.value),
          h(
            'p',
            { class: 'two-col-contact-line text-[10pt] text-black m-0 leading-[1.4]' },
            contactDetails.value.flatMap((d, i) => {
              const els: ReturnType<typeof h>[] = []
              if (i > 0) els.push(h('span', { class: 'two-col-pipe mx-[6pt]' }, '|'))
              els.push(h('span', d.value))
              return els
            }),
          ),
        ])
    },
  }),

  summary: defineComponent({
    props: { section: Object as () => ResumeSectionState },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => {
        const e = section.entries[0]
        if (!e) return ''
        return e.fields.find((f) => f.key === 'text')?.value ?? ''
      })
      return () =>
        h(PreviewSection, { heading: 'Summary' }, () =>
          h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, text.value),
        )
    },
  }),

  experience: defineComponent({
    props: { section: Object as () => ResumeSectionState },
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
            return h('div', { class: 'two-col-entry mb-[8pt]', key: entry.id }, [
              h('div', { class: 'two-col-entry-header flex justify-between items-baseline' }, [
                h('span', { class: 'two-col-bold text-[10pt] font-bold text-black' }, fieldValue(section, entry.id, 'company')),
                h('span', { class: 'two-col-dates text-[10pt] text-neutral-700 whitespace-nowrap' }, formatDateRange(section, entry.id)),
              ]),
              fieldValue(section, entry.id, 'title')
                ? h('p', { class: 'two-col-italic text-[10pt] italic text-black mt-[1pt]' }, fieldValue(section, entry.id, 'title'))
                : null,
              fieldValue(section, entry.id, 'location')
                ? h('p', { class: 'two-col-location text-[10pt] text-neutral-700 mt-[1pt]' }, fieldValue(section, entry.id, 'location'))
                : null,
              bullets.length > 0 ? h(PreviewBulletList, { bullets }) : null,
            ])
          }),
        )
    },
  }),

  education: defineComponent({
    props: { section: Object as () => ResumeSectionState },
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
            return h('div', { class: 'two-col-entry mb-[8pt]', key: entry.id }, [
              h('div', { class: 'two-col-entry-header flex justify-between items-baseline' }, [
                h('span', { class: 'two-col-bold text-[10pt] font-bold text-black' }, fieldValue(section, entry.id, 'school')),
                h('span', { class: 'two-col-dates text-[10pt] text-neutral-700 whitespace-nowrap' }, formatDateRange(section, entry.id)),
              ]),
              degreeLine
                ? h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, degreeLine)
                : null,
            ])
          }),
        )
    },
  }),

  hard_skills: defineComponent({
    props: { section: Object as () => ResumeSectionState },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => commaList(section))
      return () =>
        h(PreviewSection, { heading: 'Hard Skills' }, () =>
          h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, text.value),
        )
    },
  }),

  soft_skills: defineComponent({
    props: { section: Object as () => ResumeSectionState },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => commaList(section))
      return () =>
        h(PreviewSection, { heading: 'Soft Skills' }, () =>
          h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, text.value),
        )
    },
  }),

  projects: defineComponent({
    props: { section: Object as () => ResumeSectionState },
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
            return h('div', { class: 'two-col-entry mb-[8pt]', key: entry.id }, [
              h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, [
                h('strong', name),
                dr ? [' | ', h('span', { class: 'two-col-dates text-[10pt] text-neutral-700 whitespace-nowrap' }, dr)] : null,
              ]),
              fieldValue(section, entry.id, 'description')
                ? h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, fieldValue(section, entry.id, 'description'))
                : null,
              fieldValue(section, entry.id, 'url')
                ? h('p', { class: 'two-col-url text-[10pt] text-neutral-700 mt-[2pt] break-all' }, fieldValue(section, entry.id, 'url'))
                : null,
              bullets.length > 0 ? h(PreviewBulletList, { bullets }) : null,
            ])
          }),
        )
    },
  }),

  certifications: defineComponent({
    props: { section: Object as () => ResumeSectionState },
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
            return h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]', key: entry.id }, [
              h('strong', nameVal),
              issuer ? ` \u2014 ${issuer}` : '',
              date ? ` | ${formatMonth(date)}` : '',
            ])
          }),
        )
    },
  }),

  languages: defineComponent({
    props: { section: Object as () => ResumeSectionState },
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
          h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, text.value),
        )
    },
  }),

  hobbies: defineComponent({
    props: { section: Object as () => ResumeSectionState },
    setup(p) {
      const section: ResumeSectionState = p.section!
      const text = computed(() => commaList(section))
      return () =>
        h(PreviewSection, { heading: 'Hobbies' }, () =>
          h('p', { class: 'two-col-body-text text-[10pt] text-black m-0 leading-[1.4]' }, text.value),
        )
    },
  }),
}
</script>

<style scoped>
/*
 * Font-family with CSS variable fallback chain — kept as scoped CSS because
 * the var() call with complex fallback values (quoted font names with spaces)
 * cannot be reliably expressed in Tailwind arbitrary value syntax.
 *
 * All other styling (pt spacing, font sizes, colors, layout) uses Tailwind.
 */
.two-column-layout,
.two-column-layout__watermark,
.two-col-name,
.two-col-contact-line,
.two-col-pipe,
.two-col-bold,
.two-col-dates,
.two-col-italic,
.two-col-location,
.two-col-body-text,
.two-col-url {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
}
</style>
