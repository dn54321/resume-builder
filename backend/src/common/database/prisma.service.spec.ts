import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('file:./test.db'),
            get: jest.fn().mockReturnValue('file:./test.db'),
          },
        },
      ],
    }).compile();

    service = module.get<PrismaService>(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should proxy unknown PrismaClient properties to undefined when not initialized', () => {
    // Before init, model delegates should be undefined (not throw)
    expect(service['resume']).toBeUndefined();
    expect(service['user']).toBeUndefined();
  });

  it('should return own properties on direct access', () => {
    // The logger property is own
    expect(service['logger']).toBeDefined();
  });

  it('should implement OnModuleInit and OnModuleDestroy', () => {
    expect(typeof service.onModuleInit).toBe('function');
    expect(typeof service.onModuleDestroy).toBe('function');
  });

  it('should handle onModuleDestroy gracefully when not initialized', async () => {
    await expect(service.onModuleDestroy()).resolves.toBeUndefined();
  });
});
