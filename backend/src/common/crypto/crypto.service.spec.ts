import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

const validFieldKey =
  'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';
const validSessionKey =
  'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6';

/**
 *
 * @param overrides
 */
function mockConfigService(
  overrides: Partial<Record<string, string>> = {},
): ConfigService {
  return {
    getOrThrow: (key: string) => {
      if (key === 'SESSION_ENCRYPTION_KEY') {
        return overrides.SESSION_ENCRYPTION_KEY ?? validSessionKey;
      }
      if (key === 'RESUME_FIELD_ENCRYPTION_KEY') {
        return overrides.RESUME_FIELD_ENCRYPTION_KEY ?? validFieldKey;
      }
      throw new Error(`Unknown key: ${key}`);
    },
  } as unknown as ConfigService;
}

describe('CryptoService', () => {
  let service: CryptoService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CryptoService,
        { provide: ConfigService, useValue: mockConfigService() },
      ],
    }).compile();
    service = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('generateSessionToken', () => {
    it('should return a 64-character hex string', () => {
      const token = service.generateSessionToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should produce unique tokens', () => {
      const t1 = service.generateSessionToken();
      const t2 = service.generateSessionToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('hashToken', () => {
    it('should return a 64-character hex string', () => {
      const hash = service.hashToken('test-token');
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should be deterministic', () => {
      const h1 = service.hashToken('same-token');
      const h2 = service.hashToken('same-token');
      expect(h1).toBe(h2);
    });

    it('should produce different hashes for different inputs', () => {
      const h1 = service.hashToken('token-a');
      const h2 = service.hashToken('token-b');
      expect(h1).not.toBe(h2);
    });
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
      await expect(
        Test.createTestingModule({
          providers: [
            CryptoService,
            {
              provide: ConfigService,
              useValue: mockConfigService({
                RESUME_FIELD_ENCRYPTION_KEY: 'tooshort',
              }),
            },
          ],
        }).compile(),
      ).rejects.toThrow(
        /RESUME_FIELD_ENCRYPTION_KEY must be a 64-character hex string/,
      );
    });

    it('should throw if key contains non-hex chars', async () => {
      await expect(
        Test.createTestingModule({
          providers: [
            CryptoService,
            {
              provide: ConfigService,
              useValue: mockConfigService({
                RESUME_FIELD_ENCRYPTION_KEY: 'g'.repeat(64),
              }),
            },
          ],
        }).compile(),
      ).rejects.toThrow(
        /RESUME_FIELD_ENCRYPTION_KEY must be a 64-character hex string/,
      );
    });
  });
});
