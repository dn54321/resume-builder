import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from '../config/config.module';
import { CryptoService } from './crypto.service';

describe('CryptoService', () => {
  let service: CryptoService;

  // Generate a fresh random key for each describe block so tests are hermetic.
  const validKey =
    'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6';

  beforeAll(async () => {
    process.env.RESUME_FIELD_ENCRYPTION_KEY = validKey;
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule],
      providers: [CryptoService],
    }).compile();
    service = module.get<CryptoService>(CryptoService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('encrypt', () => {
    it('should return a hex string not containing the plaintext', () => {
      const ciphertext = service.encrypt('hello');
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext).toMatch(/^[0-9a-f]+$/);
      expect(ciphertext).not.toContain('hello');
    });

    it('should produce different ciphertexts for the same plaintext', () => {
      const c1 = service.encrypt('hello');
      const c2 = service.encrypt('hello');
      expect(c1).not.toBe(c2);
    });
  });

  describe('decrypt', () => {
    it('should round-trip: decrypt(encrypt(text)) === text', () => {
      const cases = ['hello', '', 'unicode 🎉 ñ', 'a'.repeat(10000)];
      for (const text of cases) {
        expect(service.decrypt(service.encrypt(text))).toBe(text);
      }
    });

    it('should throw on invalid hex input', () => {
      expect(() => service.decrypt('deadbeef')).toThrow();
    });

    it('should throw on tampered ciphertext', () => {
      const original = service.encrypt('hello');
      // Flip a bit in the ciphertext
      const bytes = Buffer.from(original, 'hex');
      bytes[bytes.length - 1] ^= 1;
      const tampered = bytes.toString('hex');
      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('key validation', () => {
    it('should throw if key is not exactly 64 hex chars', async () => {
      const mod = await Test.createTestingModule({
        providers: [
          CryptoService,
          {
            provide: ConfigService,
            useValue: { get: () => 'tooshort' },
          },
        ],
      }).compile();
      const svc = mod.get(CryptoService);
      expect(() => svc.encrypt('test')).toThrow(
        /RESUME_FIELD_ENCRYPTION_KEY must be a 64-character hex string/,
      );
    });

    it('should throw if key contains non-hex chars', async () => {
      const mod = await Test.createTestingModule({
        providers: [
          CryptoService,
          {
            provide: ConfigService,
            useValue: { get: () => 'g'.repeat(64) },
          },
        ],
      }).compile();
      const svc = mod.get(CryptoService);
      // Non-hex chars cause Buffer.from('hex') to produce fewer than 32 bytes
      expect(() => svc.encrypt('test')).toThrow(/RESUME_FIELD_ENCRYPTION_KEY/);
    });
  });
});
