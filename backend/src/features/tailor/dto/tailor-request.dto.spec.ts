import { ValidationPipe } from '@nestjs/common';
import { TailorRequestDto } from './tailor-request.dto';

/**
 * Regression test for the frontend→backend tailor payload contract.
 *
 * The frontend sends the FULL resume payload from store.toPayload() —
 * `resume.name`, `resume.layout` AND `resume.sections` (each section with
 * sectionId/column/order/enabled/locked/entries). Commit 66cd443 replaced
 * the old ResumePayloadDto (which declared name+layout) with a sections-only
 * DTO, so every tailor request 400'd with "resume.property name should not
 * exist" under the global ValidationPipe's forbidNonWhitelisted: true —
 * breaking the ENTIRE Tailor Resume feature (caught by e2e, RES-92).
 *
 * These tests exercise the real ValidationPipe configuration from main.ts
 * so the contract can never silently drift again.
 */
describe('TailorRequestDto (frontend payload contract)', () => {
  const pipe = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  });

  /**
   * Run the real ValidationPipe configuration over a payload, returning the
   * typed DTO (pipe.transform resolves to `any`, so the cast keeps the
   * unsafe-any lint rules quiet).
   * @param {unknown} payload - raw request body
   * @returns {Promise<TailorRequestDto>} validated and transformed TailorRequestDto
   */
  async function toDto(payload: unknown): Promise<TailorRequestDto> {
    return (await pipe.transform(payload, {
      type: 'body',
      metatype: TailorRequestDto,
    })) as TailorRequestDto;
  }

  const frontendPayload = {
    jobDescription: 'React developer with TypeScript',
    resume: {
      name: 'My Resume' as string | null,
      layout: 'standard',
      sections: [
        {
          sectionId: 'experience',
          column: 'right',
          order: 0,
          enabled: true,
          locked: true,
          entries: [
            {
              order: 0,
              parentId: null,
              fields: [{ key: 'company', value: 'Acme Corp', order: 0 }],
            },
            {
              order: 1,
              parentId: null,
              fields: [{ key: 'bullet', value: 'Built React apps', order: 0 }],
            },
          ],
        },
      ],
    },
  };

  it('accepts the full store.toPayload() shape (name + layout + sections)', async () => {
    const dto = await toDto(frontendPayload);

    expect(dto.jobDescription).toBe('React developer with TypeScript');
    expect(dto.resume).toBeDefined();
    expect(dto.resume.sections).toHaveLength(1);
  });

  it('keeps `name` and `layout` (whitelisted, not stripped)', async () => {
    const dto = await toDto(frontendPayload);

    // Explicitly declared on the DTO so forbidNonWhitelisted lets them through
    // (and whitelist:true does not strip them).
    expect(dto.resume.name).toBe('My Resume');
    expect(dto.resume.layout).toBe('standard');
  });

  it('preserves per-section locked/enabled flags for the keyword engine', async () => {
    const dto = await toDto(frontendPayload);

    const section = dto.resume.sections[0];
    expect(section.sectionId).toBe('experience');
    expect(section.column).toBe('right');
    expect(section.order).toBe(0);
    expect(section.enabled).toBe(true);
    expect(section.locked).toBe(true);
    expect(section.entries).toHaveLength(2);
  });

  it('accepts a null resume name (toPayload() emits name ?? null)', async () => {
    const payload = structuredClone(frontendPayload);
    payload.resume.name = null;

    const dto = await toDto(payload);

    expect(dto.resume.sections).toHaveLength(1);
  });

  it('still rejects unknown top-level resume properties (forbidNonWhitelisted)', async () => {
    const payload = structuredClone(frontendPayload);
    (payload.resume as Record<string, unknown>).hackerProp = 'x';

    // ValidationPipe's exceptionFactory wraps the class-validator errors in a
    // BadRequestException (the API responds 400) — that's the regression that
    // used to fire for the legitimate `name`/`layout` keys.
    await expect(
      pipe.transform(payload, { type: 'body', metatype: TailorRequestDto }),
    ).rejects.toThrow('Bad Request Exception');
  });
});
