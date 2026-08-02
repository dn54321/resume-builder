import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { ResumesModule } from './resumes.module';
import { ResumesService } from './resumes.service';
import { ResumesController } from './resumes.controller';
import { PrismaService } from '../../common/database/prisma.service';
import { CryptoService } from '../../common/crypto/crypto.service';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  providers: [
    { provide: PrismaService, useValue: {} },
    {
      provide: CryptoService,
      useValue: {
        encryptField: jest.fn(),
        decryptField: jest.fn(),
      },
    },
    {
      provide: ConfigService,
      useValue: { getOrThrow: jest.fn(), get: jest.fn() },
    },
  ],
  exports: [PrismaService, CryptoService, ConfigService],
})
class MockDependenciesModule {}

describe('ResumesModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ResumesModule, MockDependenciesModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide ResumesService', () => {
    const service = module.get(ResumesService);
    expect(service).toBeDefined();
  });

  it('should provide ResumesController', () => {
    const controller = module.get(ResumesController);
    expect(controller).toBeDefined();
  });
});
