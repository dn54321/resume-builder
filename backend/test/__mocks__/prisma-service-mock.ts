/**
 * Mock PrismaService for integration tests.
 *
 * The real PrismaService uses native ESM dynamic import() which Jest in CJS
 * mode cannot handle. This mock provides a complete replacement with the
 * same interface, avoiding the dynamic import issue entirely.
 *
 * Since integration tests validate HTTP-layer behavior (routing, middleware, auth),
 * the database layer is intentionally mocked. Database connectivity is
 * covered by unit tests.
 */
import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';

type AnyFunction = (...args: any[]) => any;

/**
 * Create a mock model delegate that returns sensible defaults
 * for common Prisma methods.
 * @returns A Proxy-wrapped handler map that responds to common Prisma model methods.
 */
function createModelMock(): Record<string, AnyFunction> {
  const handlers: Record<string, AnyFunction> = {
    findUnique: () => Promise.resolve(null),
    findFirst: () => Promise.resolve(null),
    findMany: () => Promise.resolve(null),
    create: (args?: Record<string, unknown>) =>
      Promise.resolve(args?.data ?? args ?? {}),
    update: (args?: Record<string, unknown>) =>
      Promise.resolve(args?.data ?? args ?? {}),
    upsert: (args?: Record<string, unknown>) =>
      Promise.resolve(args?.create ?? args ?? {}),
    delete: () => Promise.resolve({ count: 1 }),
    deleteMany: () => Promise.resolve({ count: 1 }),
    count: () => Promise.resolve(0),
  };

  return new Proxy(handlers, {
    get(target, prop: string) {
      return target[prop] ?? (() => Promise.resolve(null));
    },
  });
}

@Injectable()
export class MockPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  user = createModelMock();
  session = createModelMock();
  resume = createModelMock();
  section = createModelMock();
  sectionField = createModelMock();

  /** No-op init — logs for visibility in test output. */
  onModuleInit(): void {
    this.logger.log('Mock database connection established');
  }

  /** No-op teardown. */
  onModuleDestroy(): void {
    this.logger.log('Mock database connection closed');
  }

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Mock transaction that simply executes the callback with `this` as the
   * transaction client (same as the default interactive transactions behavior).
   * @param fn
   */

  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn(this);
  }
}
