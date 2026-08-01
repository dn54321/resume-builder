import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { AuthModule } from './auth.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaService } from '../common/database/prisma.service';
import { CryptoService } from '../common/crypto/crypto.service';
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
        generateSessionToken: jest.fn(),
        hashToken: jest.fn(),
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

describe('AuthModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [AuthModule, MockDependenciesModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide AuthService', () => {
    const service = module.get(AuthService);
    expect(service).toBeDefined();
  });

  it('should provide AuthController', () => {
    const controller = module.get(AuthController);
    expect(controller).toBeDefined();
  });
});
