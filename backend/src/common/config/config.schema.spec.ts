import { configValidationSchema } from './config.schema';
import type { EnvConfig } from './models/env-config.model';

describe('configValidationSchema', () => {
  // Joi.validate() returns `value: any`; we cast to EnvConfig after validation.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  it('should validate a complete valid config', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { error, value } = configValidationSchema.validate({
      NODE_ENV: 'production',
      PORT: 8080,
      DATABASE_URL: 'file:./prod.db',
      FRONTEND_URL: 'https://example.com',
      MATCHING_ENGINE: 'hybrid',
      LLM_API_KEY: 'sk-test',
      LLM_MODEL: 'gpt-4o',
      BULLET_CAP: 10,
      RESUME_FIELD_ENCRYPTION_KEY:
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      SESSION_ENCRYPTION_KEY:
        'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    });
    expect(error).toBeUndefined();
    const config = value as EnvConfig;
    expect(config.PORT).toBe(8080);
  });

  it('should apply defaults for optional fields', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { error, value } = configValidationSchema.validate({
      DATABASE_URL: 'file:./dev.db',
      RESUME_FIELD_ENCRYPTION_KEY:
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      SESSION_ENCRYPTION_KEY:
        'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    });
    expect(error).toBeUndefined();
    const config = value as EnvConfig;
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3000);
    expect(config.FRONTEND_URL).toBe('http://localhost:5173');
    expect(config.MATCHING_ENGINE).toBe('keyword');
    expect(config.LLM_MODEL).toBe('gpt-4o-mini');
    expect(config.BULLET_CAP).toBe(5);
  });

  it('should reject invalid NODE_ENV', () => {
    const { error } = configValidationSchema.validate({
      NODE_ENV: 'invalid',
      DATABASE_URL: 'file:./dev.db',
      RESUME_FIELD_ENCRYPTION_KEY:
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      SESSION_ENCRYPTION_KEY:
        'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    });
    expect(error).toBeDefined();
  });

  it('should reject missing DATABASE_URL', () => {
    const { error } = configValidationSchema.validate({
      RESUME_FIELD_ENCRYPTION_KEY:
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      SESSION_ENCRYPTION_KEY:
        'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    });
    expect(error).toBeDefined();
  });

  it('should reject invalid encryption key length', () => {
    const { error } = configValidationSchema.validate({
      DATABASE_URL: 'file:./dev.db',
      RESUME_FIELD_ENCRYPTION_KEY: 'tooshort',
      SESSION_ENCRYPTION_KEY:
        'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    });
    expect(error).toBeDefined();
  });

  it('should reject BULLET_CAP outside 1-20 range', () => {
    const { error } = configValidationSchema.validate({
      DATABASE_URL: 'file:./dev.db',
      BULLET_CAP: 50,
      RESUME_FIELD_ENCRYPTION_KEY:
        'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      SESSION_ENCRYPTION_KEY:
        'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    });
    expect(error).toBeDefined();
  });

  it('should reject non-hex encryption keys', () => {
    const { error } = configValidationSchema.validate({
      DATABASE_URL: 'file:./dev.db',
      RESUME_FIELD_ENCRYPTION_KEY:
        'zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz',
      SESSION_ENCRYPTION_KEY:
        'b1c2d3e4f5a6b7c6d9e0f1a2b3c4d5e6b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6',
    });
    expect(error).toBeDefined();
  });
});
