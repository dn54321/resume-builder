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
 * Field keys that contain bullet-point text (experience descriptions).
 */
const BULLET_FIELD_KEYS = new Set(['bullet', 'description', 'detail']);

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
   * Process a section: score bullet/skill entries, filter to top N,
   * pass non-bullet/non-skill entries through unchanged.
   * @param section
   * @param jdTokens
   */
  private filterSection(
    section: TailorRequest['resume']['sections'][number],
    jdTokens: Set<string>,
  ): TailorResponse['sections'][number] {
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

    for (const entry of section.entries) {
      if (this.isBulletEntry(entry)) {
        const text = this.getBulletText(entry) ?? '';
        scoredBullets.push({ entry, score: this.scoreText(text, jdTokens) });
      } else if (this.isSkillEntry(entry)) {
        const text = this.getSkillText(entry) ?? '';
        scoredSkills.push({ entry, score: this.scoreText(text, jdTokens) });
      } else {
        passThrough.push(entry);
      }
    }

    // Sort descending by score
    scoredBullets.sort((a, b) => b.score - a.score);
    scoredSkills.sort((a, b) => b.score - a.score);

    // Take top bulletCap bullets (or all if fewer)
    const topBullets = scoredBullets
      .slice(0, this.bulletCap)
      .map((s) => s.entry);
    const topSkills = scoredSkills.slice(0, this.bulletCap).map((s) => s.entry);

    // Combine: pass-through + top bullets + top skills, sorted by original order
    const allEntries = [...passThrough, ...topBullets, ...topSkills];
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
