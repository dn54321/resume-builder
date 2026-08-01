# Backend

NestJS 11 REST API for the resume-v3 application.

## Tech Stack

| Layer            | Choice                          |
| ---------------- | ------------------------------- |
| Framework        | NestJS 11                       |
| Language         | TypeScript 5.7                  |
| Runtime          | Node.js 24+                     |
| HTTP Platform    | Express                         |
| Package Manager  | pnpm                            |
| Logging          | Pino (via `nestjs-pino`)        |
| ORM              | Prisma 7 + `@prisma/adapter-libsql` |
| Database         | SQLite                          |
| Config           | `@nestjs/config` + Joi          |
| Linter           | ESLint 9 + typescript-eslint + Prettier |
| Formatter        | Prettier                        |
| Test Runner      | Jest 30 + ts-jest               |
| E2E Testing      | Jest + supertest                |

## Setup

```bash
pnpm install
cp .env.template .env   # Edit .env with your values
npx prisma generate     # Generate Prisma client
```

## Scripts

```bash
pnpm build              # Compile TypeScript → dist/
pnpm start              # Production start
pnpm start:dev          # Watch-mode development server
pnpm start:debug        # Debug with --inspect-brk
pnpm start:prod         # node dist/main
pnpm lint               # ESLint with auto-fix
pnpm format             # Prettier format
pnpm test               # Unit tests
pnpm test:watch         # Unit tests in watch mode
pnpm test:cov           # Unit tests + coverage
pnpm test:e2e           # End-to-end tests
```

## Project Structure

```
src/
├── main.ts                 # Entry point, NestFactory.create, CORS, port
├── app.module.ts           # Root module
├── app.controller.ts       # Root controller
├── app.service.ts          # Root service
└── <feature>/
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.controller.spec.ts
    ├── <feature>.service.ts
    ├── <feature>.service.spec.ts
    ├── dto/
    │   └── <name>.dto.ts
    └── entities/
        └── <name>.entity.ts
```

## Testing

### Unit Tests

```bash
pnpm test           # Run once
pnpm test:watch     # Watch mode
pnpm test:cov       # With coverage (90% threshold enforced)
```

### E2E Tests

```bash
pnpm test:e2e       # SuperTest against in-memory app instance
```

E2E tests use a SQLite test database (`prisma/test.db`) and a mocked Prisma client. No external services are required.

## Environment Variables

| Variable                        | Purpose                         |
| ------------------------------- | ------------------------------- |
| `PORT`                          | Server port (default: `3000`)   |
| `DATABASE_URL`                  | SQLite connection string        |
| `FRONTEND_URL`                  | CORS origin                     |
| `MATCHING_ENGINE`               | `keyword` or `llm`              |
| `RESUME_FIELD_ENCRYPTION_KEY`   | AES-256-GCM key for PII fields  |
| `SESSION_ENCRYPTION_KEY`        | AES-256-GCM key for sessions    |

## API Design

RESTful endpoints with consistent response envelopes:

- `GET /resumes` — List resumes
- `POST /resumes` — Create resume
- `GET /resumes/:id` — Get resume
- `PATCH /resumes/:id` — Update resume
- `DELETE /resumes/:id` — Delete resume
- `POST /resumes/tailor` — JD filtering (anonymous users)

Input validated via DTOs + `class-validator`. Global `ValidationPipe` with `whitelist: true, transform: true`.
