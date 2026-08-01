import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import type { EnvConfig } from '../config/models/env-config.model';

@Injectable()
export class CryptoService {
  private readonly sessionEncryptionKey: Buffer;
  private readonly resumeFieldEncryptionKey: Buffer;

  constructor(@Inject(ConfigService) config: ConfigService<EnvConfig>) {
    const sessionHexKey: string = config.getOrThrow('SESSION_ENCRYPTION_KEY');
    this.sessionEncryptionKey = this._validateAndParseKey(
      sessionHexKey,
      'SESSION_ENCRYPTION_KEY',
    );

    const fieldHexKey: string = config.getOrThrow(
      'RESUME_FIELD_ENCRYPTION_KEY',
    );
    this.resumeFieldEncryptionKey = this._validateAndParseKey(
      fieldHexKey,
      'RESUME_FIELD_ENCRYPTION_KEY',
    );
  }

  /**
   * Validate a hex-encoded encryption key and return it as a 32-byte Buffer.
   * Throws if the key is not exactly 64 hex characters.
   * @param hexKey
   * @param keyName
   */
  private _validateAndParseKey(hexKey: string, keyName: string): Buffer {
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error(`${keyName} must be a 64-character hex string`);
    }
    return Buffer.from(hexKey, 'hex');
  }

  generateSessionToken(): string {
    return randomBytes(32).toString('hex');
  }

  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  encryptField(value: string): {
    encrypted: string;
    iv: string;
    authTag: string;
  } {
    return this._encrypt(value, this.resumeFieldEncryptionKey);
  }

  decryptField(encrypted: string, iv: string, authTag: string): string {
    return this._decrypt(encrypted, iv, authTag, this.resumeFieldEncryptionKey);
  }

  private _encrypt(
    value: string,
    key: Buffer,
  ): { encrypted: string; iv: string; authTag: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return {
      encrypted: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  private _decrypt(
    encrypted: string,
    iv: string,
    authTag: string,
    key: Buffer,
  ): string {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(iv, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTag, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }
}
