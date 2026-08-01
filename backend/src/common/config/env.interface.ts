export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL: string;
  FRONTEND_URL: string;
  MATCHING_ENGINE: 'keyword' | 'llm' | 'hybrid';
  LLM_API_KEY?: string;
  LLM_MODEL?: string;
  BULLET_CAP: number;
  RESUME_FIELD_ENCRYPTION_KEY: string;
}
