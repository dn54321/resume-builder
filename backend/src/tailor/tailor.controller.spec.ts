import { Test, TestingModule } from '@nestjs/testing';
import { TailorController } from './tailor.controller';
import { TailorService } from './tailor.service';
import { TailorRequestDto } from './dto/tailor-request.dto';
import type { TailorRequest } from './models/tailor-request.model';
import type { TailorResponse } from './models/tailor-response.model';

const mockTailorResult: TailorResponse = {
  sections: [
    {
      sectionId: 'experience',
      entries: [
        {
          order: 0,
          fields: [{ key: 'bullet', value: 'Built React applications' }],
          children: [],
        },
      ],
    },
  ],
};

const mockTailorService = {
  tailor: jest.fn().mockResolvedValue(mockTailorResult),
};

/**
 *
 * @param overrides
 * @param overrides.jobDescription
 * @param overrides.resume
 */
function makeDto(
  overrides: { jobDescription?: string; resume?: unknown } = {},
) {
  return {
    jobDescription: overrides.jobDescription ?? 'React developer needed',
    resume: overrides.resume ?? {
      sections: [
        {
          sectionId: 'experience',
          order: 0,
          entries: [
            {
              order: 0,
              fields: [{ key: 'bullet', value: 'Built React applications' }],
              children: [],
            },
            {
              order: 1,
              fields: [{ key: 'bullet', value: 'Managed coffee supply chain' }],
              children: [],
            },
          ],
        },
      ],
    },
  } as TailorRequestDto;
}

describe('TailorController', () => {
  let controller: TailorController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TailorController],
      providers: [{ provide: TailorService, useValue: mockTailorService }],
    }).compile();

    controller = module.get<TailorController>(TailorController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('POST /resumes/tailor delegates to service and returns filtered result', async () => {
    const dto = makeDto({ jobDescription: 'Senior React developer' });

    await controller.tailor(dto);

    expect(mockTailorService.tailor).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const request: TailorRequest = mockTailorService.tailor.mock.calls[0][0];
    expect(request.jobDescription).toBe('Senior React developer');
    expect(request.resume.sections).toHaveLength(1);
    expect(request.resume.sections[0].sectionId).toBe('experience');
  });

  it('returns the TailorResponse from the service', async () => {
    const dto = makeDto();
    const result = await controller.tailor(dto);
    expect(result).toEqual(mockTailorResult);
  });

  it('maps resume structure correctly with multiple sections', async () => {
    const dto = makeDto({
      resume: {
        sections: [
          { sectionId: 'experience', order: 0, entries: [] },
          { sectionId: 'skills', order: 1, entries: [] },
        ],
      },
    });

    await controller.tailor(dto);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const request: TailorRequest = mockTailorService.tailor.mock.calls[0][0];
    expect(request.resume.sections).toHaveLength(2);
  });

  it('passes empty job description through correctly', async () => {
    const dto = makeDto({ jobDescription: '' });

    await controller.tailor(dto);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const request: TailorRequest = mockTailorService.tailor.mock.calls[0][0];
    expect(request.jobDescription).toBe('');
  });

  it('does not require authentication guards', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
    const routeMetadata = Reflect.getMetadata(
      '__guards__',
      TailorController.prototype.tailor,
    );
    expect(routeMetadata).toBeUndefined();
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
  });

  it('is decorated with @Controller("resumes")', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const pathMetadata = Reflect.getMetadata('path', TailorController);
    expect(pathMetadata).toBe('resumes');
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
  });

  it('decorates tailor method with @Post("tailor")', () => {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
    const methodMetadata = Reflect.getMetadata(
      'method',
      TailorController.prototype.tailor,
    );

    const pathMetadata = Reflect.getMetadata(
      'path',
      TailorController.prototype.tailor,
    );
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/unbound-method */
    expect(methodMetadata).toBe(1); // RequestMethod.POST
    expect(pathMetadata).toBe('tailor');
  });
});
