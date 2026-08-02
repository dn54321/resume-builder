import { Injectable, Logger } from '@nestjs/common';
import type { MatchingEngine } from './matching-engine.interface';
import type { TailorRequest } from '../models/tailor-request.model';
import type { TailorResponse } from '../models/tailor-response.model';
import type { SectionEntryDto } from '../../resumes/dto/create-resume.dto';

/**
 * Configuration for the OpenAI-compatible chat completions API.
 */
export interface LlmConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
}

/** Shape of the OpenAI chat completions response we care about. */
interface LlmApiResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

/** Shape of the parsed JSON from the LLM. */
interface LlmParsedResponse {
  bulletIndices: number[];
  skillIndices: number[];
}

/**
 * Field keys that identify bullet-type entries.
 */
const BULLET_FIELD_KEYS = new Set(['bullet', 'description', 'detail']);

/**
 * Field keys that identify skill-type entries.
 */
const SKILL_FIELD_KEYS = new Set(['skill', 'skills', 'skillName', 'name']);

/**
 * LLM-based matching engine that sends entries to an OpenAI-compatible API
 * for relevance ranking against the job description.
 */
@Injectable()
export class LlmEngine implements MatchingEngine {
  private readonly logger = new Logger(LlmEngine.name);
  private readonly config: LlmConfig;
  private readonly bulletCap: number;

  constructor(config: LlmConfig, bulletCap: number = 5) {
    this.config = {
      baseUrl: 'https://api.openai.com/v1',
      ...config,
    };
    this.bulletCap = bulletCap;
  }

  private isBulletEntry(entry: SectionEntryDto): boolean {
    return entry.fields.some((f) => BULLET_FIELD_KEYS.has(f.key));
  }

  private isSkillEntry(entry: SectionEntryDto): boolean {
    return entry.fields.some((f) => SKILL_FIELD_KEYS.has(f.key));
  }

  private getEntryLabel(entry: SectionEntryDto): string {
    for (const field of entry.fields) {
      if (BULLET_FIELD_KEYS.has(field.key) || SKILL_FIELD_KEYS.has(field.key)) {
        return field.value;
      }
    }
    return entry.fields.map((f) => `${f.key}: ${f.value}`).join('; ');
  }

  /**
   * Build a prompt listing numbered entries and asking for relevant indices.
   * @param jd
   * @param entries
   */
  private buildPrompt(
    jd: string,
    entries: Array<{ label: string; type: string }>,
  ): string {
    const entryList = entries
      .map((e, i) => `${i}: [${e.type}] ${e.label}`)
      .join('\n');

    return `You are a resume tailoring assistant. Given a job description and a numbered list of resume entries (each tagged as [bullet] or [skill]), return the indices of the most relevant entries.

Job Description:
${jd}

Entries:
${entryList}

Return ONLY a JSON object with keys "bulletIndices" and "skillIndices". Each key maps to an array of entry indices (integers) sorted by relevance (most relevant first). Include at most ${this.bulletCap} entries per category. If there are fewer than ${this.bulletCap} relevant entries, return all of them. If no entries are relevant, return empty arrays.

Example response:
{"bulletIndices": [3, 0, 7], "skillIndices": [2, 5]}`;
  }

  /**
   * Call the OpenAI-compatible chat completions API.
   * @param prompt
   */
  private async callLlm(prompt: string): Promise<{
    bulletIndices: number[];
    skillIndices: number[];
  }> {
    const url = `${this.config.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a precise resume tailoring assistant. Always respond with valid JSON only.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `LLM API returned ${response.status}: ${body.slice(0, 200)}`,
      );
    }

    const data = (await response.json()) as LlmApiResponse;
    const content: string = data.choices?.[0]?.message?.content ?? '';

    // Extract JSON from response (may be wrapped in backticks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      this.logger.error('LLM response did not contain valid JSON', content);
      throw new Error('LLM response did not contain valid JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]) as LlmParsedResponse;

    if (
      !Array.isArray(parsed.bulletIndices) ||
      !Array.isArray(parsed.skillIndices)
    ) {
      throw new Error(
        'LLM response missing bulletIndices or skillIndices arrays',
      );
    }

    return {
      bulletIndices: parsed.bulletIndices.filter(
        (i: unknown) => typeof i === 'number',
      ),
      skillIndices: parsed.skillIndices.filter(
        (i: unknown) => typeof i === 'number',
      ),
    };
  }

  async match(request: TailorRequest): Promise<TailorResponse> {
    const sections: TailorResponse['sections'] = [];

    for (const section of request.resume.sections) {
      const passThrough: SectionEntryDto[] = [];
      const categorized: Array<{
        entry: SectionEntryDto;
        label: string;
        type: 'bullet' | 'skill';
        originalIndex: number;
      }> = [];

      for (const entry of section.entries) {
        if (this.isBulletEntry(entry)) {
          categorized.push({
            entry,
            label: this.getEntryLabel(entry),
            type: 'bullet',
            originalIndex: categorized.length,
          });
        } else if (this.isSkillEntry(entry)) {
          categorized.push({
            entry,
            label: this.getEntryLabel(entry),
            type: 'skill',
            originalIndex: categorized.length,
          });
        } else {
          passThrough.push(entry);
        }
      }

      if (categorized.length === 0 || !request.jobDescription.trim()) {
        // No entries to score or empty JD — return all
        sections.push({
          sectionId: section.sectionId,
          entries: section.entries,
        });
        continue;
      }

      const entriesForPrompt = categorized.map((c) => ({
        label: c.label,
        type: c.type,
      }));

      const prompt = this.buildPrompt(request.jobDescription, entriesForPrompt);

      const { bulletIndices, skillIndices } = await this.callLlm(prompt);

      // Collect selected entries by index
      const selectedSet = new Set<number>();
      for (const idx of bulletIndices) {
        if (idx >= 0 && idx < categorized.length) selectedSet.add(idx);
      }
      for (const idx of skillIndices) {
        if (idx >= 0 && idx < categorized.length) selectedSet.add(idx);
      }

      const selectedEntries = categorized
        .filter((_, i) => selectedSet.has(i))
        .map((c) => c.entry);

      // Combine pass-through + selected, sorted by original order
      const allEntries = [...passThrough, ...selectedEntries];
      allEntries.sort((a, b) => a.order - b.order);

      sections.push({
        sectionId: section.sectionId,
        entries: allEntries,
      });
    }

    return { sections };
  }
}
