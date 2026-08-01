/**
 * CryptoService — AES-256-GCM encryption for SectionField values.
 *
 * Each encrypt() call uses a fresh random 12-byte IV. The output is a
 * single hex string: IV (12B) + authTag (16B) + ciphertext.
 *
 * The RESUME_FIELD_ENCRYPTION_KEY must be a 32-byte (64 hex char) value
 * generated independently. It is read from NestJS config at startup.
 */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto';

const IV_LENGTH = 12; // GCM recommended
const AUTH_TAG_LENGTH = 16; // GCM default
const KEY_LENGTH = 32; // AES-256

@Injectable()
export class CryptoService {
  private _key: Buffer | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Lazily initializes and validates the encryption key from config.
   * Throws if RESUME_FIELD_ENCRYPTION_KEY is missing, wrong length,
   * or contains non-hex characters.
   */
  private get key(): Buffer {
    if (this._key) return this._key;
    const hexKey = this.configService.get<string>('RESUME_FIELD_ENCRYPTION_KEY');
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        'RESUME_FIELD_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)',
      );
    }
    this._key = Buffer.from(hexKey, 'hex');
    if (this._key.length !== KEY_LENGTH) {
      this._key = null;
      throw new Error(
        `RESUME_FIELD_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes`,
      );
    }
    return this._key;
  }

  /**
   * Encrypt a plaintext string.
   * Returns a hex-encoded string: iv(12B) + authTag(16B) + ciphertext.
   * Two calls with the same plaintext produce different ciphertexts.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf-8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, encrypted]).toString('hex');
  }

  /**
   * Decrypt a ciphertext produced by encrypt().
   * Throws if the ciphertext is malformed or has been tampered with.
   */
  decrypt(ciphertext: string): string {
    if (typeof ciphertext !== 'string') {
      throw new Error('Ciphertext must be a hex string');
    }
    const data = Buffer.from(ciphertext, 'hex');

    if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
      throw new Error('Ciphertext is too short');
    }

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    try {
      return Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]).toString('utf-8');
    } catch {
      throw new Error('Decryption failed: invalid key or tampered ciphertext');
    }
  }
}
