/**
 * Mock PrismaService for e2e tests.
 *
 * The real PrismaService uses native ESM dynamic import() which Jest in CJS
 * mode cannot handle. This mock provides a complete replacement with the
 * same interface, avoiding the dynamic import issue entirely.
 *
 * Since e2e tests validate HTTP-layer behavior (routing, middleware, auth),
 * the database layer is intentionally mocked. Database connectivity is
 * covered by unit tests.
 */
import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';

@Injectable()
export class MockPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('PrismaService');

  // Prisma model delegates (mocked as empty objects with common methods)
  user = createModelMock();
  session = createModelMock();
  resume = createModelMock();
  section = createModelMock();
  sectionField = createModelMock();

  async onModuleInit(): Promise<void> {
    this.logger.log('Mock database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Mock database connection closed');
  }

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  $transaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

function createModelMock() {
  return new Proxy({} as any, {
    get(_target, prop) {
      if (prop === 'findUnique' || prop === 'findFirst' || prop === 'findMany') {
        return () => Promise.resolve(null);
      }
      if (prop === 'create' || prop === 'update' || prop === 'upsert') {
        return (args: any) => Promise.resolve(args?.data ?? args ?? {});
      }
      if (prop === 'delete' || prop === 'deleteMany') {
        return () => Promise.resolve({ count: 1 });
      }
      if (prop === 'count') {
        return () => Promise.resolve(0);
      }
      // Allow any other method call without crashing
      return () => Promise.resolve(null);
    },
  });
}
