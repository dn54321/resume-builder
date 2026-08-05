import { Injectable } from '@nestjs/common';
import type { MatchingEngine } from './matching-engine.interface';
import type { TailorRequest } from '../models/tailor-request.model';
import type { TailorResponse } from '../models/tailor-response.model';
import type { ScoredEntry } from '../models/scored-entry.model';
import type { SectionEntryDto } from '../../resumes/dto/create-resume.dto';

/**
 * English stop words filtered out during JD tokenization.
 */
const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'shall',
  'should',
  'may',
  'might',
  'must',
  'can',
  'could',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'me',
  'him',
  'her',
  'us',
  'them',
  'my',
  'your',
  'his',
  'its',
  'our',
  'their',
  'this',
  'that',
  'these',
  'those',
  'not',
  'no',
  'nor',
  'so',
  'very',
  'just',
  'about',
  'also',
  'etc',
]);

/**
 * Field keys that contain bullet-point text. `text` is the key the builder
 * editors (ExperienceEditor/ProjectsEditor via BulletList) actually emit;
 * bullet/description/detail are accepted for legacy payloads.
 */
const BULLET_FIELD_KEYS = new Set(['bullet', 'description', 'detail', 'text']);

/**
 * Field keys that contain skill names.
 */
const SKILL_FIELD_KEYS = new Set(['skill', 'skills', 'skillName', 'name']);

/**
 * Keyword-based matching engine using TF-IDF-style token overlap.
 * 100% offline — no network calls.
 */
@Injectable()
export class KeywordEngine implements MatchingEngine {
  private readonly bulletCap: number;

  constructor(bulletCap: number = 5) {
    this.bulletCap = bulletCap;
  }

  /**
   * Tokenize the job description: lowercase, split on non-alpha,
   * remove stop words, keep unique tokens.
   * @param jd
   */
  private tokenize(jd: string): Set<string> {
    const tokens = jd
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
    return new Set(tokens);
  }

  /**
   * Score a text value against JD tokens: count of overlapping tokens
   * divided by text length (normalize to avoid long texts winning).
   * @param text
   * @param jdTokens
   */
  private scoreText(text: string, jdTokens: Set<string>): number {
    if (!text || jdTokens.size === 0) return 0;
    const words = text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean);
    if (words.length === 0) return 0;
    const matches = words.filter((w) => jdTokens.has(w)).length;
    return matches / words.length;
  }

  /**
   * Extract the text value from an entry's bullet-type field.
   * @param entry
   */
  private getBulletText(entry: SectionEntryDto): string | null {
    for (const field of entry.fields) {
      if (BULLET_FIELD_KEYS.has(field.key)) {
        return field.value;
      }
    }
    return null;
  }

  /**
   * Extract the text value from an entry's skill-type field.
   * @param entry
   */
  private getSkillText(entry: SectionEntryDto): string | null {
    for (const field of entry.fields) {
      if (SKILL_FIELD_KEYS.has(field.key)) {
        return field.value;
      }
    }
    return null;
  }

  /**
   * Check if an entry is a bullet-type entry.
   * @param entry
   */
  private isBulletEntry(entry: SectionEntryDto): boolean {
    return entry.fields.some((f) => BULLET_FIELD_KEYS.has(f.key));
  }

  /**
   * Check if an entry is a skill-type entry.
   * @param entry
   */
  private isSkillEntry(entry: SectionEntryDto): boolean {
    return entry.fields.some((f) => SKILL_FIELD_KEYS.has(f.key));
  }

  /**
   * Process a section: keep only bullet/skill entries that score > 0
   * against the JD (zero-score entries are dropped), capped at bulletCap
   * PER top-level entry for bullets and per section for skills. This
   * restores the pre-66cd443 semantics the frontend was built against
   * ("Showing relevant bullets (max N per entry)"): a bullet with no JD
   * token overlap is hidden when the section is unlocked, and a locked
   * section is skipped entirely — every entry passes through unchanged.
   *
   * Locking is honoured at TWO levels (RES-97):
   *  - Section locked (RES-92): every entry in the section passes through
   *    unchanged — a fast-path that skips the whole section.
   *  - Entry locked (RES-97): the individual sub-item passes through
   *    unchanged even inside an otherwise unlocked section — it is never
   *    removed or re-ranked, regardless of JD keyword overlap.
   * @param section
   * @param jdTokens
   */
  private filterSection(
    section: TailorRequest['resume']['sections'][number],
    jdTokens: Set<string>,
  ): TailorResponse['sections'][number] {
    // Locked sections are skipped entirely — every entry passes through
    // unchanged so their visibility is left exactly as the user set it.
    if (section.locked === true) {
      return {
        sectionId: section.sectionId,
        entries: section.entries,
      };
    }

    if (jdTokens.size === 0) {
      // Empty JD: return all entries unfiltered
      return {
        sectionId: section.sectionId,
        entries: section.entries,
      };
    }

    const scoredBullets: ScoredEntry[] = [];
    const scoredSkills: ScoredEntry[] = [];
    const passThrough: SectionEntryDto[] = [];
    // Locked sub-items (RES-97) always pass through unfiltered — they are
    // never removed or re-ranked, even when they score zero against the JD.
    const lockedPassThrough: SectionEntryDto[] = [];

    for (const entry of section.entries) {
      if (entry.locked === true) {
        lockedPassThrough.push(entry);
      } else if (this.isBulletEntry(entry)) {
        const text = this.getBulletText(entry) ?? '';
        scoredBullets.push({ entry, score: this.scoreText(text, jdTokens) });
      } else if (this.isSkillEntry(entry)) {
        const text = this.getSkillText(entry) ?? '';
        scoredSkills.push({ entry, score: this.scoreText(text, jdTokens) });
      } else {
        passThrough.push(entry);
      }
    }

    // Skills: keep only entries with a JD match, capped per section.
    const topSkills = scoredSkills
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.bulletCap)
      .map((s) => s.entry);

    // Bullets: group by parent entry so the cap applies PER top-level entry
    // (each job's bullet list gets its own top-N), matching the frontend's
    // "max {{ bulletCap }} per entry" copy. Entries without a parentId are
    // grouped together so flat bullet payloads still get capped.
    const bulletsByParent = new Map<string | null, ScoredEntry[]>();
    for (const scored of scoredBullets) {
      const parentId = scored.entry.parentId ?? null;
      if (!bulletsByParent.has(parentId)) {
        bulletsByParent.set(parentId, []);
      }
      bulletsByParent.get(parentId)!.push(scored);
    }
    const topBullets: SectionEntryDto[] = [];
    for (const group of bulletsByParent.values()) {
      const kept = group
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, this.bulletCap)
        .map((s) => s.entry);
      topBullets.push(...kept);
    }

    // Combine: locked pass-through (RES-97) + pass-through + kept bullets +
    // kept skills, sorted by original order. Locked sub-items are included
    // unconditionally — never dropped for zero JD overlap, never counted
    // against the per-entry/section caps.
    const allEntries = [
      ...lockedPassThrough,
      ...passThrough,
      ...topBullets,
      ...topSkills,
    ];
    allEntries.sort((a, b) => a.order - b.order);

    return {
      sectionId: section.sectionId,
      entries: allEntries,
    };
  }

  match(request: TailorRequest): Promise<TailorResponse> {
    const jdTokens = this.tokenize(request.jobDescription);

    const sections = request.resume.sections.map((section) =>
      this.filterSection(section, jdTokens),
    );

    return Promise.resolve({ sections });
  }
}
