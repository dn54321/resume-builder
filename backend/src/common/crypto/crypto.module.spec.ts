import { Test, TestingModule } from '@nestjs/testing';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoModule } from './crypto.module';
import { CryptoService } from './crypto.service';

const validFieldKey =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const validSessionKey =
  'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: {
        getOrThrow: (key: string) => {
          if (key === 'SESSION_ENCRYPTION_KEY') return validSessionKey;
          if (key === 'RESUME_FIELD_ENCRYPTION_KEY') return validFieldKey;
          throw new Error(`Unknown key: ${key}`);
        },
      },
    },
  ],
  exports: [ConfigService],
})
class MockConfigModule {}

describe('CryptoModule', () => {
  let module: TestingModule;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [CryptoModule, MockConfigModule],
    }).compile();
  });

  afterAll(async () => {
    await module.close();
  });

  it('should compile the module', () => {
    expect(module).toBeDefined();
  });

  it('should provide CryptoService', () => {
    const service = module.get(CryptoService);
    expect(service).toBeDefined();
    expect(service).toBeInstanceOf(CryptoService);
  });
});
