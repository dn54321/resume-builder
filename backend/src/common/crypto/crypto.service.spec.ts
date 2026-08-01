import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '../config/config.module';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  const validFieldKey =
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
  const validSessionKey =
    'b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

  beforeAll(async () => {
    process.env.RESUME_FIELD_ENCRYPTION_KEY = validFieldKey;
    process.env.SESSION_ENCRYPTION_KEY = validSessionKey;
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [CryptoService],
    }).compile();
    service = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encryptField', () => {
    it('should return a hex-encoded object not containing the plaintext', () => {
      const result = service.encryptField('hello');
      expect(typeof result.encrypted).toBe('string');
      expect(result.encrypted).toMatch(/^[0-9a-f]+$/);
      expect(result.encrypted).not.toContain('hello');
      expect(result.iv).toMatch(/^[0-9a-f]+$/);
      expect(result.authTag).toMatch(/^[0-9a-f]+$/);
    });

    it('should produce different ciphertexts for the same plaintext', () => {
      const c1 = service.encryptField('hello');
      const c2 = service.encryptField('hello');
      expect(c1.encrypted).not.toBe(c2.encrypted);
    });
  });

  describe('decryptField', () => {
    it('should round-trip: decryptField(encryptField(text)) === text', () => {
      const cases = ['hello', '', 'unicode 🎉 ñ', 'a'.repeat(10000)];
      for (const text of cases) {
        const enc = service.encryptField(text);
        expect(service.decryptField(enc.encrypted, enc.iv, enc.authTag)).toBe(
          text,
        );
      }
    });

    it('should throw on invalid hex input', () => {
      expect(() =>
        service.decryptField('deadbeef', 'aa'.repeat(12), 'bb'.repeat(16)),
      ).toThrow();
    });

    it('should throw on tampered ciphertext', () => {
      const enc = service.encryptField('hello');
      // Flip a bit in the ciphertext
      const bytes = Buffer.from(enc.encrypted, 'hex');
      bytes[bytes.length - 1] ^= 1;
      const tampered = bytes.toString('hex');
      expect(() =>
        service.decryptField(tampered, enc.iv, enc.authTag),
      ).toThrow();
    });
  });

  describe('key validation', () => {
    it('should throw if field key is not exactly 64 hex chars', async () => {
      const mod = await Test.createTestingModule({
        providers: [
          CryptoService,
          {
            provide: ConfigService,
            useValue: {
              getOrThrow: (key: string) => {
                if (key === 'SESSION_ENCRYPTION_KEY') return validSessionKey;
                if (key === 'RESUME_FIELD_ENCRYPTION_KEY') return 'tooshort';
                throw new Error(`Unknown key: ${key}`);
              },
            },
          },
        ],
      }).compile();
      const svc = mod.get<CryptoService>(CryptoService);
      expect(() => svc.encryptField('test')).toThrow(
        /RESUME_FIELD_ENCRYPTION_KEY must be a 64-character hex string/,
      );
    });

    it('should throw if key contains non-hex chars', async () => {
      const mod = await Test.createTestingModule({
        providers: [
          CryptoService,
          {
            provide: ConfigService,
            useValue: {
              getOrThrow: (key: string) => {
                if (key === 'SESSION_ENCRYPTION_KEY') return validSessionKey;
                if (key === 'RESUME_FIELD_ENCRYPTION_KEY')
                  return 'g'.repeat(64);
                throw new Error(`Unknown key: ${key}`);
              },
            },
          },
        ],
      }).compile();
      const svc = mod.get<CryptoService>(CryptoService);
      // Non-hex chars cause Buffer.from('hex') to produce fewer than 32 bytes
      expect(() => svc.encryptField('test')).toThrow(
        /RESUME_FIELD_ENCRYPTION_KEY/,
      );
    });
  });
});
