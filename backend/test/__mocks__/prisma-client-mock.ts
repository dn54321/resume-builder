// Mock PrismaClient for Jest integration tests.
// The generated prisma client uses import.meta.url (ESM-only syntax)
// which cannot be parsed by ts-jest in CJS mode. This mock provides
// a CJS-compatible replacement for integration test purposes.
//
// The integration test validates HTTP layer behavior (routing, middleware, etc.)
// Database connectivity is tested separately in prisma-schema.spec.ts.

class PrismaClient {
  constructor(_options?: any) {
    // no-op: accept adapter/log options from PrismaService
  }

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }

  $on(_eventType: string, _callback: (event: any) => void): void {
    // no-op
  }
}

export { PrismaClient };
