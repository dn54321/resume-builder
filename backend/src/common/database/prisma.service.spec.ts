/**
 * PrismaService tests.
 *
 * The PrismaService uses dynamic import() to load the ESM-only Prisma 7
 * client in a CJS project. Jest's default VM cannot handle dynamic imports,
 * so we spy on the private _init method instead of triggering real imports.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  let service: PrismaService;
  let mockConfigGetOrThrow: jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigGetOrThrow = jest.fn().mockReturnValue('file:./test.db');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: mockConfigGetOrThrow,
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

  it('should proxy unknown model delegates to undefined when not initialized', () => {
    expect(service['resume']).toBeUndefined();
    expect(service['user']).toBeUndefined();
  });

  it('should return own properties (logger)', () => {
    expect(service['logger']).toBeDefined();
  });

  it('should proxy when own property exists (not undefined)', () => {
    // The proxy should return own properties directly without falling through
    // to the undefined/client checks
    expect(service['logger']).toBeDefined();
    expect(service['config']).toBeDefined();
  });

  it('should delegate unknown props to the underlying client when initialized', () => {
    // Once _client exists, any property missing from the service (model
    // delegates like `user`, `resume`, ...) is looked up on the client.
    (service as unknown as { _client: Record<string, unknown> })._client = {
      user: 'user-delegate',
      resume: 'resume-delegate',
    };

    expect((service as unknown as Record<string, unknown>)['user']).toBe(
      'user-delegate',
    );
    expect((service as unknown as Record<string, unknown>)['resume']).toBe(
      'resume-delegate',
    );
  });

  it('should still return undefined for unknown props when client exists but has no such prop', () => {
    (service as unknown as { _client: Record<string, unknown> })._client = {};

    expect(
      (service as unknown as Record<string, unknown>)['nonexistentProp'],
    ).toBeUndefined();
  });

  describe('onModuleInit', () => {
    it('should call _getClient and connect', async () => {
      const mockClient = { $connect: jest.fn().mockResolvedValue(undefined) };
      jest
        .spyOn(
          service as unknown as { _getClient: () => Promise<unknown> },
          '_getClient',
        )
        .mockResolvedValue(mockClient);

      await service.onModuleInit();
      expect(mockClient.$connect).toHaveBeenCalled();
    });
  });

  describe('onModuleDestroy', () => {
    it('should handle destroy when not initialized', async () => {
      await expect(service.onModuleDestroy()).resolves.toBeUndefined();
    });

    it('should disconnect when client exists', async () => {
      const mockClient = {
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $connect: jest.fn().mockResolvedValue(undefined),
      };

      // Set the client via reflection
      (service as unknown as { _client: unknown })._client = mockClient;

      await service.onModuleDestroy();
      expect(mockClient.$disconnect).toHaveBeenCalled();
    });
  });

  describe('_getClient', () => {
    it('should return cached client if exists', async () => {
      const mockClient = {};
      (service as unknown as { _client: unknown })._client = mockClient;

      const getClient = (
        service as unknown as {
          _getClient: () => Promise<unknown>;
        }
      )._getClient;
      const result = (await getClient.call(service)) as Record<string, never>;
      expect(result).toBe(mockClient);
    });

    it('should call _init if no client', async () => {
      const mockClient = {};
      jest
        .spyOn(service as unknown as { _init: () => Promise<unknown> }, '_init')
        .mockResolvedValue(mockClient);

      const getClient = (
        service as unknown as {
          _getClient: () => Promise<unknown>;
        }
      )._getClient;
      const result = (await getClient.call(service)) as Record<string, never>;
      expect(result).toBe(mockClient);
    });

    it('should reuse an in-flight init promise instead of re-initialising', async () => {
      const mockClient = {};
      const initSpy = jest
        .spyOn(service as unknown as { _init: () => Promise<unknown> }, '_init')
        .mockResolvedValue(mockClient);

      // Simulate a concurrent caller already kicking off _init.
      (
        service as unknown as { _initPromise: Promise<unknown> | null }
      )._initPromise = Promise.resolve(mockClient);

      const getClient = (
        service as unknown as {
          _getClient: () => Promise<unknown>;
        }
      )._getClient;
      const result = (await getClient.call(service)) as Record<string, never>;

      expect(result).toBe(mockClient);
      expect(initSpy).not.toHaveBeenCalled();
    });
  });
});
