import { Injectable, Logger } from '@nestjs/common';
import type { MatchingEngine } from './matching-engine.interface';
import type { TailorRequest } from '../models/tailor-request.model';
import type {
  ResumePayload,
  ResumeSectionPayload,
  ResumeEntryPayload,
} from '../models/resume-payload.model';
import type {
  TailorResponse,
  EntryBulletIndices,
} from '../models/tailor-response.model';

/**
 * Sections that contain bullet points (children entries with 'text' field).
 */
const BULLET_SECTION_TYPES = ['experience', 'projects'] as const;

/**
 * Sections that contain skills (entries with 'name' field).
 */
const SKILL_SECTION_TYPES = ['hard_skills', 'soft_skills'] as const;

/**
 * Common English stop words. These are excluded from JD tokenization
 * because they carry no domain-specific signal.
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
  '&',
  '-',
  '—',
  '–',
]);

// ─── Helper types for bullet scoring ──────────────────────────────

interface ScoredBullet {
  entryIndex: number; // index into top-level entries
  bulletIndex: number; // index into that entry's children
  score: number;
}

interface ScoredSkill {
  name: string;
  score: number;
}

@Injectable()
export class KeywordEngine implements MatchingEngine {
  private readonly logger = new Logger(KeywordEngine.name);

  /**
   * Tokenize text for keyword matching.
   * Lowercase, split on non-alphanumeric, remove stop words and short tokens.
   * @param text
   */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
  }

  /**
   * Score a text against a set of JD tokens.
   * Returns the count of JD tokens found in the text, divided by the number
   * of tokens in the text (to avoid bias toward long text). Minimum 0.
   * @param text
   * @param jdTokens
   */
  private scoreText(text: string, jdTokens: Set<string>): number {
    const tokens = this.tokenize(text);
    if (tokens.length === 0) return 0;
    let hits = 0;
    for (const t of tokens) {
      if (jdTokens.has(t)) hits++;
    }
    return hits / tokens.length;
  }

  /**
   * Get bullet text from an entry's children.
   * @param entry
   */
  private getBulletTexts(
    entry: ResumeEntryPayload,
  ): { index: number; text: string }[] {
    const children = entry.children ?? [];
    return children
      .sort((a, b) => a.order - b.order)
      .map((child, index) => ({
        index,
        text: child.fields.find((f) => f.key === 'text')?.value ?? '',
      }))
      .filter((b) => b.text.trim().length > 0);
  }

  /**
   * Get skill name from an entry's fields.
   * @param entry
   */
  private getSkillName(entry: ResumeEntryPayload): string {
    return (entry.fields.find((f) => f.key === 'name')?.value ?? '')
      .toLowerCase()
      .trim();
  }

  /**
   * Score bullets for a section with bullet-type entries.
   * Returns scored bullets sorted descending by score.
   * @param section
   * @param jdTokenSet
   */
  private scoreBullets(
    section: ResumeSectionPayload,
    jdTokenSet: Set<string>,
  ): ScoredBullet[] {
    const topLevel = section.entries
      .filter((e) => !e.parentId)
      .sort((a, b) => a.order - b.order);

    const scored: ScoredBullet[] = [];
    for (let entryIndex = 0; entryIndex < topLevel.length; entryIndex++) {
      const entry = topLevel[entryIndex];
      const bullets = this.getBulletTexts(entry);
      for (const bullet of bullets) {
        const score = this.scoreText(bullet.text, jdTokenSet);
        if (score > 0) {
          scored.push({
            entryIndex,
            bulletIndex: bullet.index,
            score,
          });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /**
   * Score skills for a skills section.
   * Returns scored skills sorted descending by score.
   * @param section
   * @param jdTokenSet
   */
  private scoreSkills(
    section: ResumeSectionPayload,
    jdTokenSet: Set<string>,
  ): ScoredSkill[] {
    const topLevel = section.entries
      .filter((e) => !e.parentId)
      .sort((a, b) => a.order - b.order);

    const scored: ScoredSkill[] = [];
    for (const entry of topLevel) {
      const name = this.getSkillName(entry);
      if (!name) continue;
      const score = this.scoreText(name, jdTokenSet);
      if (score > 0) {
        scored.push({ name, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /**
   * Top-N capped bullet selection per entry.
   * Groups scored bullets by entry, then takes the top `bulletCap` per entry.
   * @param scoredBullets
   * @param bulletCap
   */
  private capPerEntry(
    scoredBullets: ScoredBullet[],
    bulletCap: number,
  ): EntryBulletIndices[] {
    // Group by entry
    const byEntry = new Map<number, ScoredBullet[]>();
    for (const b of scoredBullets) {
      if (!byEntry.has(b.entryIndex)) {
        byEntry.set(b.entryIndex, []);
      }
      byEntry.get(b.entryIndex)!.push(b);
    }

    const result: EntryBulletIndices[] = [];
    for (const [entryOrder, bullets] of byEntry) {
      // Already sorted globally, so top-N per entry are first
      bullets.sort((a, b) => b.score - a.score);
      const capped = bullets.slice(0, bulletCap);
      result.push({
        entryOrder,
        bulletIndices: capped.map((b) => b.bulletIndex).sort((a, b) => a - b),
      });
    }

    // Sort by entryOrder for deterministic output
    result.sort((a, b) => a.entryOrder - b.entryOrder);
    return result;
  }

  /**
   * Main match method.
   * @param request
   * @param bulletCap
   */
  match(request: TailorRequest, bulletCap: number): TailorResponse {
    const jd = request.jobDescription;
    if (!jd || jd.trim().length === 0) {
      // Empty JD → return empty filter (all items shown)
      return {
        filteredBulletIndices: {},
        filteredHardSkills: [],
        filteredSoftSkills: [],
      };
    }

    const jdTokens = this.tokenize(jd);
    const jdTokenSet = new Set(jdTokens);
    this.logger.debug(
      `JD tokens (unique): ${jdTokenSet.size} total: ${jdTokens.length}`,
    );

    const filteredBulletIndices: Record<string, EntryBulletIndices[]> = {};
    let filteredHardSkills: string[] = [];
    let filteredSoftSkills: string[] = [];

    for (const section of request.resume.sections) {
      if (
        BULLET_SECTION_TYPES.includes(
          section.sectionId as (typeof BULLET_SECTION_TYPES)[number],
        )
      ) {
        const scored = this.scoreBullets(section, jdTokenSet);
        const capped = this.capPerEntry(scored, bulletCap);
        if (capped.length > 0) {
          filteredBulletIndices[section.sectionId] = capped;
        } else {
          // Even if no bullets scored, include empty arrays so frontend
          // knows to hide all bullets in this section
          const topLevel = section.entries.filter((e) => !e.parentId);
          if (topLevel.some((e) => (e.children?.length ?? 0) > 0)) {
            filteredBulletIndices[section.sectionId] = topLevel.map((_, i) => ({
              entryOrder: i,
              bulletIndices: [],
            }));
          }
        }
      } else if (section.sectionId === 'hard_skills') {
        const scored = this.scoreSkills(section, jdTokenSet);
        filteredHardSkills = scored.map((s) => s.name);
        // Cap hard skills at bulletCap per section
        if (filteredHardSkills.length > bulletCap) {
          filteredHardSkills = filteredHardSkills.slice(0, bulletCap);
        }
      } else if (section.sectionId === 'soft_skills') {
        const scored = this.scoreSkills(section, jdTokenSet);
        filteredSoftSkills = scored.map((s) => s.name);
        if (filteredSoftSkills.length > bulletCap) {
          filteredSoftSkills = filteredSoftSkills.slice(0, bulletCap);
        }
      }
    }

    return {
      filteredBulletIndices,
      filteredHardSkills,
      filteredSoftSkills,
    };
  }
}
