# AGENTS.md — Backend (NestJS)

## Project Identity

This is the **backend** for **resume-v3**, a resume-building application. It is a [NestJS](https://nestjs.com/) REST API server built with TypeScript, part of a monorepo alongside a Vue/Vite frontend.

**Root package:** `backend/`  
**Package manager:** `pnpm`  
**Runtime:** Node.js ≥ 24  

## Tech Stack

| Layer            | Choice                          |
| ---------------- | ------------------------------- |
| Framework        | NestJS 11                       |
| Language         | TypeScript 5.7                  |
| Runtime          | Node.js 24+                     |
| HTTP Platform    | Express (via `@nestjs/platform-express`) |
| Package Manager  | pnpm                            |
| Logging          | Pino (via `nestjs-pino`)        |
| ORM              | Prisma 7 + `@prisma/adapter-libsql` |
| Database         | SQLite (migrating to PostgreSQL) |
| Config           | `@nestjs/config` + Joi          |
| Linter           | ESLint 9 + typescript-eslint + Prettier |
| Formatter        | Prettier                        |
| Test Runner      | Jest 30 + ts-jest               |
| E2E Testing      | Jest + supertest                |
| Build            | `nest build` (tsc wrapper)      |

## Scripts (run from `backend/`)

```bash
pnpm build          # Compile TypeScript → dist/
pnpm start          # Production start
pnpm start:dev      # Watch-mode development server
pnpm start:debug    # Debug with --inspect-brk
pnpm start:prod     # node dist/main
pnpm lint           # ESLint with auto-fix
pnpm format         # Prettier format
pnpm test           # Unit tests
pnpm test:watch     # Unit tests in watch mode
pnpm test:cov       # Unit tests + coverage
pnpm test:e2e       # End-to-end tests
```

## Project Structure

```
backend/
├── src/
│   ├── main.ts                 # Entry point, NestFactory.create, CORS, port
│   ├── app.module.ts           # Root module
│   ├── app.controller.ts       # Root controller
│   ├── app.controller.spec.ts  # Root controller unit tests
│   ├── app.service.ts          # Root service
│   └── <feature>/
│       ├── <feature>.module.ts
│       ├── <feature>.controller.ts
│       ├── <feature>.controller.spec.ts
│       ├── <feature>.service.ts
│       ├── <feature>.service.spec.ts
│       ├── dto/
│       │   └── <name>.dto.ts
│       └── entities/
│           └── <name>.entity.ts
├── test/
│   └── app.e2e-spec.ts         # E2E test(s)
├── nest-cli.json               # Nest CLI config (sourceRoot, compiler options)
├── tsconfig.json               # Base TS config
├── tsconfig.build.json         # Build-specific TS config
├── eslint.config.mjs           # ESLint flat config
├── package.json
└── pnpm-lock.yaml
```

### NestJS Architecture Rules

- Product feature live in `src/feature/<feature>/`.
- Each feature has its own **module**, **controller**, and **service**.
- **DTOs** go in a `dto/` subdirectory; use `class-validator` decorators for validation.
- **Enums** go in `dto/enums`
- **Entities** (database models) go in `entities/`.
- **Pipes, guards, interceptors, filters** shared across features go in `src/common/`.
- **Configuration** should use `@nestjs/config` (ConfigModule) with `.env` files.

## Coding Conventions
- Avoid code comments, only writing doc comments in the function and class signature.
- Use verbose variable names.
- Avoid re-assigning variables once they are assigned.
- Keep things formal.
- The enum name should be plural. The enums keys should be in SCREAMING_SNAKE_CASE.

### TypeScript / NestJS

- **Strict null checks** are on (`strictNullChecks: true`).
- Use **decorators** (`@Controller`, `@Get`, `@Post`, `@Injectable`, etc.) — the NestJS way.
- **Dependency injection** via constructors — never `new` a service directly.
- **Return types** should be explicit on controller methods and public service methods.
- Use **DTO classes** (not interfaces) for request/response shapes so that decorators and validation work.
- Controllers handle HTTP concerns only; business logic belongs in **services**.
- Use `@nestjs/common` validation pipe globally in `main.ts`:

  ```ts
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  ```

### Naming

| Thing         | Convention                                | Example                    |
| ------------- | ----------------------------------------- | -------------------------- |
| Modules       | PascalCase, `.module.ts`                  | `ResumesModule`            |
| Controllers   | PascalCase, `.controller.ts`              | `ResumesController`        |
| Services      | PascalCase, `.service.ts`                 | `ResumesService`           |
| DTOs          | PascalCase, `.dto.ts`                     | `CreateResumeDto`          |
| Entities      | PascalCase, `.entity.ts`                  | `Resume`                   |
| Test files    | `<name>.spec.ts`                          | `resumes.service.spec.ts`  |
| E2E tests     | `<name>.e2e-spec.ts` in `test/`           | `resumes.e2e-spec.ts`      |

### NestJS CLI Generators

Use the Nest CLI to scaffold new features quickly:

```bash
npx nest generate module <name>
npx nest generate controller <name>
npx nest generate service <name>
npx nest generate class <path>/<name>.dto
npx nest generate class <path>/<name>.entity
```

## Testing

### Unit Tests (Jest)

- Located alongside the file they test: `*.spec.ts`.
- Services get **mock dependencies** passed via the constructor.
- Controllers get a mock service.
- Coverage reports go to `../coverage/` (repo root level).

```ts
// Example service test pattern
const module: TestingModule = await Test.createTestingModule({
  providers: [
    ResumesService,
    { provide: PrismaService, useValue: mockPrisma },
  ],
}).compile();
```

### E2E Tests

- Located in `test/`.
- Use `supertest` against the full app `INestApplication`.
- Start app with `app.init()` in `beforeAll`, close in `afterAll`.

## Linting & Formatting

- **ESLint 9** flat config in `eslint.config.mjs`.
- **Prettier** integration via `eslint-plugin-prettier` and `eslint-config-prettier`.
- Run `pnpm lint` before committing — CI should enforce clean lint.

## Environment Variables

- `PORT` — server port (default: `3000`).
- Add new variables to a `.env` file (git-ignored) and load via `@nestjs/config`.

## API Design Principles

- **RESTful** endpoints: `GET /resumes`, `POST /resumes`, `GET /resumes/:id`, `PATCH /resumes/:id`, `DELETE /resumes/:id`.
- Return **consistent envelope** responses (e.g., `{ data, meta, errors }`) or follow team-agreed conventions.
- Use **HTTP status codes** correctly (201 for created, 204 for no content, 404 for not found, 422 for validation errors).
- **Versioning**: Consider prefixing with `/api/v1/` if the API will evolve.
- Validate all input with DTOs + `class-validator`.

## Database

Current: **SQLite** via `@prisma/adapter-libsql`. Planned migration to PostgreSQL.

- SQLite file lives at `prisma/dev.db` (git-ignored).
- Schema: `prisma/schema.prisma`.
- Client is generated to `src/generated/prisma/` (git-ignored).
- The `PrismaService` (singleton, extends `PrismaClient`) is provided by `DatabaseModule`.
- The adapter is passed in the constructor — to switch to PostgreSQL later, swap the adapter and change the datasource provider.

**Migration to PostgreSQL (future steps):**
1. Install `@prisma/adapter-pg` + `pg`.
2. Change `datasource.provider` to `"postgresql"` in `schema.prisma`.
3. Update `DATABASE_URL` to a Postgres connection string.
4. Swap `PrismaLibSql` for `PrismaPg(pool)` in `PrismaService`.
5. Run `npx prisma migrate dev`.

## Security

- Enable **CORS** in `main.ts` for the frontend origin.
- Use **Helmet** (`@nestjs/platform-express` + `helmet`) for HTTP headers.
- Validate and sanitize all user input.
- Never expose stack traces in production responses.
- Store secrets in environment variables (`.env`), never committed.

## Git Workflow

- Feature branches from `main`.
- Commit messages: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, etc.).
- PRs should pass lint + tests before merge.
