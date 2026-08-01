import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseModule } from './database.module';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        getOrThrow: jest.fn().mockReturnValue('file:./test.db'),
        get: jest.fn().mockReturnValue('file:./test.db'),
      },
    },
  ],
  exports: [ConfigService],
})
class MockConfigModule {}

describe('DatabaseModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [DatabaseModule, MockConfigModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide PrismaService', () => {
    const service = module.get(PrismaService);
    expect(service).toBeDefined();
  });
});
