<template>
  <div class="standard-layout p-[48pt] min-h-[960pt]">
    <!-- Empty state watermark -->
    <div v-if="isEmpty" class="standard-layout__watermark flex items-center justify-center min-h-[600pt] text-[16pt] text-gray-400 italic select-none">
      Your resume preview will appear here.
    </div>

    <!-- Rendered sections -->
    <template v-for="section in nonEmptySections" :key="section.sectionId">
      <!-- name_contact -->
      <div v-if="section.sectionType === 'name_contact'" class="standard-layout__name-contact text-center mb-[14pt]">
        <h1 class="standard-layout__name text-[18pt] font-bold text-black m-0 mb-[4pt]">{{ nameValue(section, 'fullName') || 'Your Name' }}</h1>
        <p class="standard-layout__contact-line text-[10pt] text-black m-0 leading-[1.4]">
          <template v-for="(detail, di) in contactDetails(section)" :key="detail.key">
            <span v-if="di > 0" class="standard-layout__pipe mx-[6pt] text-black">|</span>
            <span>{{ detail.value }}</span>
          </template>
        </p>
      </div>

      <!-- summary -->
      <PreviewSection v-else-if="section.sectionType === 'summary'" heading="Summary">
        <p class="standard-layout__summary-text text-[10pt] text-black m-0 leading-[1.4]">{{ summaryText(section) }}</p>
      </PreviewSection>

      <!-- experience -->
      <PreviewSection v-else-if="section.sectionType === 'experience'" heading="Experience">
        <div v-for="entry in topLevelEntries(section)" :key="entry.id" class="standard-layout__experience-entry mb-[8pt]">
          <div class="standard-layout__experience-header flex justify-between items-baseline">
            <span class="standard-layout__company text-[10pt] font-bold text-black">{{ fieldValue(section, entry.id, 'company') }}</span>
            <span class="standard-layout__dates text-[10pt] text-gray-700 whitespace-nowrap">{{ formatDateRange(section, entry.id) }}</span>
          </div>
          <p v-if="fieldValue(section, entry.id, 'title')" class="standard-layout__experience-title text-[10pt] italic text-black mt-[1pt]">
            {{ fieldValue(section, entry.id, 'title') }}
          </p>
          <p v-if="fieldValue(section, entry.id, 'location')" class="standard-layout__experience-location text-[10pt] text-gray-700 mt-[1pt]">
            {{ fieldValue(section, entry.id, 'location') }}
          </p>
          <PreviewBulletList :bullets="entryBullets(section, entry.id)" />
        </div>
      </PreviewSection>

      <!-- education -->
      <PreviewSection v-else-if="section.sectionType === 'education'" heading="Education">
        <div v-for="entry in topLevelEntries(section)" :key="entry.id" class="standard-layout__education-entry mb-[6pt]">
          <div class="standard-layout__education-header flex justify-between items-baseline">
            <span class="standard-layout__school text-[10pt] font-bold text-black">{{ fieldValue(section, entry.id, 'school') }}</span>
            <span class="standard-layout__dates text-[10pt] text-gray-700 whitespace-nowrap">{{ formatDateRange(section, entry.id) }}</span>
          </div>
          <p v-if="fieldValue(section, entry.id, 'degree')" class="standard-layout__education-degree text-[10pt] text-black mt-[1pt]">
            {{ fieldValue(section, entry.id, 'degree') }}
            <template v-if="fieldValue(section, entry.id, 'fieldOfStudy')">
              , {{ fieldValue(section, entry.id, 'fieldOfStudy') }}
            </template>
          </p>
        </div>
      </PreviewSection>

      <!-- hard_skills -->
      <PreviewSection v-else-if="section.sectionType === 'hard_skills'" heading="Hard Skills">
        <p class="standard-layout__skills-text text-[10pt] text-black m-0 leading-[1.4]">{{ commaList(section) }}</p>
      </PreviewSection>

      <!-- soft_skills -->
      <PreviewSection v-else-if="section.sectionType === 'soft_skills'" heading="Soft Skills">
        <p class="standard-layout__skills-text text-[10pt] text-black m-0 leading-[1.4]">{{ commaList(section) }}</p>
      </PreviewSection>

      <!-- projects -->
      <PreviewSection v-else-if="section.sectionType === 'projects'" heading="Projects">
        <div v-for="entry in topLevelEntries(section)" :key="entry.id" class="standard-layout__project-entry mb-[8pt]">
          <p class="standard-layout__project-name text-[10pt] text-black m-0">
            <strong>{{ fieldValue(section, entry.id, 'name') }}</strong>
            <template v-if="fieldValue(section, entry.id, 'startDate') || fieldValue(section, entry.id, 'endDate')">
              <span class="standard-layout__dates text-[10pt] text-gray-700 whitespace-nowrap"> | {{ formatDateRange(section, entry.id) }}</span>
            </template>
          </p>
          <p v-if="fieldValue(section, entry.id, 'description')" class="standard-layout__project-description text-[10pt] text-black mt-[2pt] leading-[1.4]">
            {{ fieldValue(section, entry.id, 'description') }}
          </p>
          <p v-if="fieldValue(section, entry.id, 'url')" class="standard-layout__project-url text-[10pt] text-gray-700 mt-[2pt] break-all">
            {{ fieldValue(section, entry.id, 'url') }}
          </p>
          <PreviewBulletList :bullets="entryBullets(section, entry.id)" />
        </div>
      </PreviewSection>

      <!-- certifications -->
      <PreviewSection v-else-if="section.sectionType === 'certifications'" heading="Certifications">
        <div v-for="entry in topLevelEntries(section)" :key="entry.id" class="standard-layout__cert-entry mb-[3pt]">
          <p class="standard-layout__cert-name text-[10pt] text-black m-0">
            <strong>{{ fieldValue(section, entry.id, 'name') }}</strong>
            <template v-if="fieldValue(section, entry.id, 'issuer')">
              &mdash; {{ fieldValue(section, entry.id, 'issuer') }}
            </template>
            <template v-if="fieldValue(section, entry.id, 'date')">
              <span class="standard-layout__dates text-[10pt] text-gray-700 whitespace-nowrap"> | {{ formatMonth(fieldValue(section, entry.id, 'date')) }}</span>
            </template>
          </p>
        </div>
      </PreviewSection>

      <!-- languages -->
      <PreviewSection v-else-if="section.sectionType === 'languages'" heading="Languages">
        <p class="standard-layout__languages-text text-[10pt] text-black m-0 leading-[1.4]">{{ languagesList(section) }}</p>
      </PreviewSection>

      <!-- hobbies -->
      <PreviewSection v-else-if="section.sectionType === 'hobbies'" heading="Hobbies">
        <p class="standard-layout__skills-text text-[10pt] text-black m-0 leading-[1.4]">{{ commaList(section) }}</p>
      </PreviewSection>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PreviewSection from './PreviewSection.vue'
import PreviewBulletList from './PreviewBulletList.vue'
import type { ResumeSectionState, SectionEntryState } from '@/features/builder/types/resume'

const props = defineProps<{
  sections: ResumeSectionState[]
}>()

interface ContactDetail {
  key: string
  value: string
}

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
 * Get the name value from a name_contact section.
 * @param section - The name_contact section.
 * @param key - The field key (e.g., 'fullName').
 * @returns The field value string, or empty string.
 */
function nameValue(section: ResumeSectionState, key: string): string {
  const entry = section.entries[0]
  if (!entry) return ''
  return entry.fields.find((f) => f.key === key)?.value ?? ''
}

/**
 * Extract non-empty contact details from a name_contact section.
 * @param section - The name_contact section.
 * @returns Array of contact detail key-value pairs (excluding empty fields).
 */
function contactDetails(section: ResumeSectionState): ContactDetail[] {
  const entry = section.entries[0]
  if (!entry) return []
  const contactFields = ['email', 'phone', 'location', 'linkedin', 'website']
  return contactFields
    .filter((key) => {
      const val = entry.fields.find((f) => f.key === key)?.value
      return val && val.trim().length > 0
    })
    .map((key) => ({
      key,
      value: entry.fields.find((f) => f.key === key)!.value,
    }))
}

/**
 * Get the summary text from a summary section.
 * @param section - The summary section.
 * @returns The summary text, or empty string.
 */
function summaryText(section: ResumeSectionState): string {
  const entry = section.entries[0]
  if (!entry) return ''
  return entry.fields.find((f) => f.key === 'text')?.value ?? ''
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
 * Format a YYYY-MM month string to human-readable "Mon YYYY" form.
 * @param monthStr - Month string in YYYY-MM format.
 * @returns Formatted string like "Jan 2020", or the original string if unparseable.
 */
function formatMonth(monthStr: string): string {
  if (!monthStr) return ''
  // monthStr is YYYY-MM
  const parts = monthStr.split('-')
  if (parts.length !== 2) return monthStr
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const monthIndex = parseInt(parts[1]!, 10) - 1
  if (monthIndex < 0 || monthIndex > 11) return monthStr
  return `${months[monthIndex]} ${parts[0]}`
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
 * Build a comma-separated list of languages with proficiency in parentheses.
 * @param section - The languages section.
 * @returns Comma-separated string like "English (Native), Spanish (Intermediate)".
 */
function languagesList(section: ResumeSectionState): string {
  return topLevelEntries(section)
    .map((e) => {
      const name = fieldValue(section, e.id, 'name').trim()
      const prof = fieldValue(section, e.id, 'proficiency').trim()
      if (!name) return ''
      return prof ? `${name} (${prof})` : name
    })
    .filter((v) => v.length > 0)
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
</script>

<style scoped>
/*
 * Font-family with CSS variable fallback chain — kept as scoped CSS because
 * the var() call with complex fallback values (quoted font names with spaces)
 * cannot be reliably expressed in Tailwind arbitrary value syntax.
 *
 * All other styling (pt spacing, font sizes, colors, layout) uses Tailwind.
 */
.standard-layout,
.standard-layout__watermark,
.standard-layout__name,
.standard-layout__contact-line,
.standard-layout__pipe,
.standard-layout__summary-text,
.standard-layout__company,
.standard-layout__experience-title,
.standard-layout__experience-location,
.standard-layout__school,
.standard-layout__education-degree,
.standard-layout__dates,
.standard-layout__skills-text,
.standard-layout__project-name,
.standard-layout__project-description,
.standard-layout__project-url,
.standard-layout__cert-name,
.standard-layout__languages-text {
  font-family: var(--preview-font, 'Georgia', 'Times New Roman', serif);
}
</style>
