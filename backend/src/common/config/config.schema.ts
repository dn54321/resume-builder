import * as Joi from 'joi';

export const configValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),

  PORT: Joi.number().port().default(3000),

  DATABASE_URL: Joi.string().required(),

  FRONTEND_URL: Joi.string().uri().default('http://localhost:5173'),

  MATCHING_ENGINE: Joi.string()
    .valid('keyword', 'llm', 'hybrid')
    .default('keyword'),

  LLM_API_KEY: Joi.string().allow('').optional(),

  LLM_MODEL: Joi.string().default('gpt-4o-mini'),

  BULLET_CAP: Joi.number().integer().min(1).max(20).default(5),

  RESUME_FIELD_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),

  SESSION_ENCRYPTION_KEY: Joi.string().hex().length(64).required(),
});
