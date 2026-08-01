import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { TailorModule } from './tailor.module';
import { TailorService } from './tailor.service';
import { TailorController } from './tailor.controller';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: { get: jest.fn((key: string, def?: unknown) => def ?? 5) },
    },
  ],
  exports: [ConfigService],
})
class MockDependenciesModule {}

describe('TailorModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [TailorModule, MockDependenciesModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide TailorService', () => {
    const service = module.get(TailorService);
    expect(service).toBeDefined();
  });

  it('should provide TailorController', () => {
    const controller = module.get(TailorController);
    expect(controller).toBeDefined();
  });
});
