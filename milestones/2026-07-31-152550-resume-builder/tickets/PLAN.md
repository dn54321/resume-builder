# Ticket Plan — Resume Builder

**Milestone:** milestones/2026-07-31-152550-resume-builder/SPEC.md
**Date:** 2026-08-01 00:00:00 UTC
**Total Tickets:** 12

## Epics

| # | Epic Title | User Story | Tickets |
|---|------------|------------|---------|
| 1 | Authenticate and manage account | As a job seeker, I want to build a resume anonymously and later save it to an account without losing anything. | T-001, T-002, T-003, T-004, T-005 |
| 2 | Create and edit resume content | As a job seeker, I want to choose a layout, toggle sections, and fill in all my resume details. | T-006, T-007, T-008 |
| 3 | View live preview and export PDF | As a job seeker, I want to see a live preview of my resume as I edit and export it as a PDF. | T-009, T-010 |
| 4 | Tailor resume to a job description | As a job seeker, I want to paste a job description and have the builder automatically select the most relevant bullet points and skills. | T-011, T-012 |

## Ticket List

---

### T-001: [DB] Create Prisma schema and run initial migration

**Epic:** Authenticate and manage account
**Type:** backend
**Depends on:** none

```
ref: none

## Summary
Define the complete database schema in Prisma for the resume builder, including User accounts, Resume top-level config, section templates, resume-section assignments, section entries with hierarchical children (for bullet points and sub-items), and individually encrypted section fields. Run the initial migration against SQLite and seed the 10 reference Section rows.

## What to Build

### File: `backend/prisma/schema.prisma`

Replace the existing placeholder schema with the full model set. Use SQLite as the datasource provider (migration to PostgreSQL is a future milestone).

**Models to create:**

1. **User** — id (uuid, default), email (unique), password (hashed string), createdAt (default now). Has one-to-many relation to Resume.

2. **Resume** — id (uuid, default), userId (FK to User, cascade delete), layout (String, default "standard"), name (String?, optional label), createdAt, updatedAt. Has one-to-many relation to ResumeSection.

3. **Section** — id (String, @id — use the section key as the primary key, e.g. "name_contact"), label (String, human-readable). Has one-to-many relation to ResumeSection. This table is a static reference — seed all 10 rows and never modify at runtime.

4. **ResumeSection** — id (uuid, default), resumeId (FK to Resume), sectionId (FK to Section), column (String, default "right" — "left" or "right" for 2:1 layout assignment), order (Int, default 0). Has @@unique([resumeId, sectionId]). Has one-to-many relation to SectionEntry.

5. **SectionEntry** — id (uuid, default), resumeSectionId (FK to ResumeSection), order (Int, default 0), parentId (String?, optional self-referential FK for children via "EntryChildren" relation). Has one-to-many to SectionField, one-to-many to children (self-relation), optional parent.

6. **SectionField** — id (uuid, default), sectionEntryId (FK to SectionEntry), key (String — e.g. "full_name", "company", "bullet_text"), value (String — AES-256-GCM encrypted ciphertext at rest), order (Int, default 0).

### File: `backend/prisma/seed.ts`

Create a seed script that inserts the 10 Section reference rows:

| id | label |
|----|-------|
| name_contact | Name & Contact |
| summary | Summary |
| experience | Experience |
| education | Education |
| hard_skills | Hard Skills |
| soft_skills | Soft Skills |
| certifications | Certifications |
| projects | Projects |
| languages | Languages |
| hobbies | Hobbies |

### Commands to run

```bash
cd backend
npx prisma migrate dev --name init
npx prisma db seed
```

## Acceptance Criteria
- [ ] `prisma migrate dev` creates all 6 tables in dev.db without errors
- [ ] All relations (FKs, cascade deletes, unique constraints) are enforced
- [ ] SectionEntry self-relation allows parent/child hierarchies
- [ ] `prisma db seed` inserts exactly 10 Section rows
- [ ] Prisma Client generation succeeds and produces typed client in `src/generated/prisma/`

## Technical Notes
- Datasource: `provider = "sqlite"` with `url = env("DATABASE_URL")` pointing to `file:./dev.db`
- Use `@prisma/adapter-libsql` for the adapter — the PrismaService constructor already expects it
- The Section model uses string IDs (the section key) rather than auto-generated IDs — these are semantically meaningful constants
- Seeding should use `upsert` or check for existence to be idempotent
- Make sure `prisma.config.ts` has the seed path configured: `seed: 'tsx prisma/seed.ts'`
```

---

### T-002: [INFRA] Set up NestJS config, database, and logger modules

**Epic:** Authenticate and manage account
**Type:** backend
**Depends on:** T-001

```
ref: T-001

## Summary
Wire up the three foundational NestJS infrastructure modules: configuration management with schema validation, database access via Prisma, and structured logging via Pino. Apply the global `/api/v1` prefix and enable CORS, Helmet, and the global ValidationPipe.

## What to Build

### File: `backend/src/common/config/config.module.ts`

Create a `ConfigModule` using `@nestjs/config`:
- Load `.env` file
- Validate all environment variables with Joi schema (see `config.schema.ts`)
- Make the module `@Global()` so all feature modules can inject config without importing

### File: `backend/src/common/config/config.schema.ts`

Define and export a Joi validation schema for:

| Variable | Type | Default | Notes |
|----------|------|---------|-------|
| PORT | number | 3000 | |
| DATABASE_URL | string | file:./dev.db | |
| MATCHING_ENGINE | string | keyword | Valid values: keyword, llm, hybrid |
| LLM_API_KEY | string? | — | Required when MATCHING_ENGINE is llm or hybrid |
| LLM_MODEL | string | gpt-4o-mini | |
| BULLET_CAP | number | 5 | |
| ENCRYPTION_KEY | string | — | 32-byte hex-encoded, required |

### File: `backend/src/common/config/env.interface.ts`

Export a TypeScript interface `Env` matching the validated schema so services can inject typed config.

### File: `backend/src/common/database/database.module.ts`

Create a `DatabaseModule` that:
- Is `@Global()`
- Provides `PrismaService` as a singleton
- Imports `ConfigModule` to read `DATABASE_URL`

### File: `backend/src/common/database/prisma.service.ts`

Update the existing `PrismaService`:
- Extends `PrismaClient`
- Constructor: creates the `PrismaLibSql` adapter with `DATABASE_URL` from config
- Implement `OnModuleInit` to call `this.$connect()` on startup
- Implement `OnModuleDestroy` to call `this.$disconnect()` on shutdown

### File: `backend/src/common/logger/logger.module.ts`

Create a `LoggerModule` using `nestjs-pino`:
- Use `pino-pretty` in development
- JSON output in production
- Redact sensitive headers (Authorization, Cookie)

### File: `backend/src/main.ts`

Update to:
- `app.setGlobalPrefix('api/v1')`
- Enable CORS for the frontend origin (`http://localhost:5173` by default, configurable via `CORS_ORIGIN` env var)
- Install `helmet` and apply `app.use(helmet())`
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`

### File: `backend/src/app.module.ts`

Import `ConfigModule`, `DatabaseModule`, and `LoggerModule`.

## Acceptance Criteria
- [ ] Server starts on the configured PORT without errors
- [ ] `GET http://localhost:3000/api/v1` returns the root controller response (not a 404)
- [ ] Joi validation rejects startup if required env vars are missing
- [ ] Logs appear via Pino with timestamps and request context
- [ ] `PrismaService` connects to the SQLite database on startup
- [ ] CORS allows requests from the configured frontend origin
- [ ] Helmet security headers are present on all responses

## Technical Notes
- `@nestjs/config`, `joi`, `nestjs-pino`, `pino-pretty`, `helmet` should already be in dependencies
- The `ConfigModule.forRoot()` call accepts `validationSchema` and `isGlobal: true`
- Pino logger should be set as the NestJS logger via `app.useLogger(app.get(Logger))` in main.ts
- Keep the adapter-libsql approach — PrismaService already uses it
```

---

### T-003: [CRYPTO] Implement CryptoService for per-field PII encryption

**Epic:** Authenticate and manage account
**Type:** backend
**Depends on:** T-002

```
ref: T-002

## Summary
Build a singleton NestJS service that encrypts and decrypts individual string values using AES-256-GCM. Every SectionField value stored in the database is encrypted with a fresh random IV per encryption call. The service reads the 32-byte hex-encoded ENCRYPTION_KEY from config at startup.

## What to Build

### File: `backend/src/common/crypto/crypto.module.ts`

Create a `CryptoModule`:
- Is `@Global()`
- Provides `CryptoService` as a singleton
- Imports `ConfigModule`

### File: `backend/src/common/crypto/crypto.service.ts`

Create a `CryptoService`:

```typescript
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService<Env>) {
    const hexKey = this.configService.getOrThrow('ENCRYPTION_KEY');
    this.key = Buffer.from(hexKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
    }
  }

  encrypt(plaintext: string): string { ... }
  decrypt(ciphertext: string): string { ... }
}
```

**encrypt(plaintext):**
1. Generate a 12-byte random IV using `crypto.randomBytes(12)`
2. Create an AES-256-GCM cipher with the key and IV
3. Encrypt the plaintext (UTF-8)
4. Get the 16-byte auth tag
5. Return: `iv + authTag + encrypted` as a hex-encoded string (`iv.toString('hex') + authTag.toString('hex') + encrypted.toString('hex')`)

**decrypt(ciphertext):**
1. Decode the hex string back to a Buffer
2. Extract: first 12 bytes = IV, next 16 bytes = auth tag, remainder = ciphertext
3. Create an AES-256-GCM decipher with the key, IV, and auth tag
4. Decrypt and return the UTF-8 string
5. Throw a descriptive error if decryption fails (tampered or corrupted data)

### File: `backend/src/common/crypto/crypto.service.spec.ts`

Unit tests:
- Encrypt a string and verify the output is hex and different from the input
- Decrypt the encrypted value and verify it matches the original
- Encrypt the same string twice and verify the outputs are different (random IV)
- Decrypt with wrong key throws
- Decrypt with tampered ciphertext throws
- Reject ENCRYPTION_KEY of wrong length on construction

### File: `backend/src/app.module.ts`

Import `CryptoModule`.

## Acceptance Criteria
- [ ] `encrypt('hello')` returns a hex string that does not contain 'hello'
- [ ] `decrypt(encrypt('hello')) === 'hello'`
- [ ] Two calls to `encrypt('hello')` produce different ciphertexts
- [ ] `decrypt('deadbeef')` throws — not valid ciphertext
- [ ] Service throws at construction if ENCRYPTION_KEY is not exactly 32 bytes (64 hex chars)
- [ ] All unit tests pass

## Technical Notes
- Use Node.js built-in `crypto` module — no external dependencies
- AES-256-GCM provides both confidentiality and authenticity (tamper detection)
- The IV + auth tag + ciphertext encoding into a single hex string means field values are self-contained — no need for a separate IV column
- Encryption key should never be logged. If Pino is configured to redact, ensure ENCRYPTION_KEY is in the redact list
- Future: this service can be swapped to a KMS-backed implementation by keeping the same `encrypt`/`decrypt` interface
```

---

### T-004: [AUTH] Implement signup, login, logout, and session endpoints

**Epic:** Authenticate and manage account
**Type:** backend
**Depends on:** T-002

```
ref: T-002

## Summary
Build the Auth module with four endpoints: signup, login, logout, and me. Use bcrypt for password hashing and session-based authentication (a random token stored in the User record or a separate Session table, returned to the client and sent as a Bearer token or cookie on subsequent requests). The auth guard protects authenticated endpoints.

## What to Build

### Directory: `backend/src/features/auth/`

Create the auth feature module with NestJS CLI:

```bash
npx nest generate module features/auth
npx nest generate controller features/auth
npx nest generate service features/auth
```

### File: `backend/src/features/auth/auth.module.ts`

Import `DatabaseModule` (for PrismaService access). Provide `AuthService`. No other special imports.

### File: `backend/src/features/auth/auth.service.ts`

Implement:

- **signup(dto: SignupDto): Promise<{ user: SafeUser; token: string }>**
  - Validate email is not already taken
  - Hash password with bcrypt (12 rounds)
  - Create User row
  - Generate a random 64-byte session token, store it hashed in the User record (or a Session table)
  - Return user (without password) + session token

- **login(dto: LoginDto): Promise<{ user: SafeUser; token: string }>**
  - Find User by email
  - Compare password hash with bcrypt
  - Generate new session token, store it
  - Return user + token

- **logout(token: string): Promise<void>**
  - Invalidate the session token

- **validateSession(token: string): Promise<User>**
  - Hash the incoming token, look up the session/user
  - Return the User or throw UnauthorizedException
  - Used by the auth guard

- **getMe(userId: string): Promise<SafeUser>**
  - Return user by ID without the password field

### File: `backend/src/features/auth/dto/signup.dto.ts`

```typescript
export class SignupDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;
}
```

### File: `backend/src/features/auth/dto/login.dto.ts`

```typescript
export class LoginDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

### File: `backend/src/features/auth/auth.controller.ts`

```typescript
@Controller('auth')
export class AuthController {
  @Post('signup')
  signup(@Body() dto: SignupDto): Promise<{ user: SafeUser; token: string }> { ... }

  @Post('login')
  login(@Body() dto: LoginDto): Promise<{ user: SafeUser; token: string }> { ... }

  @Post('logout')
  @UseGuards(AuthGuard)
  logout(@Headers('authorization') authHeader: string): Promise<void> { ... }

  @Get('me')
  @UseGuards(AuthGuard)
  getMe(@Req() req: AuthenticatedRequest): Promise<SafeUser> { ... }
}
```

All prefixed under `/api/v1` via the global prefix, so full paths are `/api/v1/auth/signup`, etc.

### File: `backend/src/common/guards/auth.guard.ts`

Create `AuthGuard`:
- Extracts Bearer token from `Authorization` header
- Calls `AuthService.validateSession(token)`
- Attaches the User to `request.user`
- Throws 401 if token is missing or invalid

### Session Storage

Choose one approach:
- **Simple:** Add `sessionToken` (hashed) column to the User model. One session per user, replaced on each login. No separate Session table needed for single-device use.
- **Preferred for correctness:** Create a `Session` model with id, userId, token (hashed), createdAt. This allows multiple sessions. Update `schema.prisma` in a migration.

## Acceptance Criteria
- [ ] `POST /api/v1/auth/signup` with valid email/password returns 201 with user + token
- [ ] `POST /api/v1/auth/signup` with duplicate email returns 409
- [ ] `POST /api/v1/auth/login` with correct credentials returns 200 with user + token
- [ ] `POST /api/v1/auth/login` with wrong password returns 401
- [ ] `POST /api/v1/auth/logout` with valid token returns 200 and invalidates the session
- [ ] `GET /api/v1/auth/me` with valid token returns the user (without password)
- [ ] `GET /api/v1/auth/me` without token or with invalid token returns 401
- [ ] AuthGuard can be used on any controller with `@UseGuards(AuthGuard)`
- [ ] Validate email format in DTOs (returns 400 on bad email)

## Technical Notes
- Use `bcrypt` (or `bcryptjs` for no native deps) for password hashing — 12 salt rounds
- Session tokens: use `crypto.randomBytes(64).toString('hex')` — hash with SHA-256 before storing
- The `@Req()` decorator in NestJS with a custom `AuthenticatedRequest` interface extending `Request` to add `user: User`
- The AuthGuard should be in `src/common/guards/` since it's shared across features
- Log invalid login attempts but never log passwords or tokens
```

---

### T-005: [AUTH] Create login and signup pages with anonymous-to-authenticated transition

**Epic:** Authenticate and manage account
**Type:** frontend
**Depends on:** T-004

```
ref: T-004

## Summary
Build the login and signup pages as Vue routes. Implement the `useAuth` composable and an auth Pinia store to manage session state. When the user authenticates from anonymous mode, the frontend automatically imports their localStorage resume data to the backend before switching to server-backed persistence.

## What to Build

### Files: `frontend/src/features/auth/LoginView.vue`, `frontend/src/features/auth/SignupView.vue`

Two route-level views:
- `/login` — email + password form, submit calls `POST /api/v1/auth/login`
- `/signup` — email + password (+ confirm password) form, submit calls `POST /api/v1/auth/signup`

Both pages:
- Redirect to `/builder` if already authenticated
- Show inline validation errors from the API (duplicate email, wrong password, etc.)
- On success: call the auth store's login action, then redirect to `/builder`

### File: `frontend/src/features/auth/stores/auth.ts`

Pinia setup store `useAuthStore`:

```typescript
export const useAuthStore = defineStore('auth', () => {
  const user = ref<SafeUser | null>(null)
  const token = ref<string | null>(null)
  const isAuthenticated = computed(() => user.value !== null && token.value !== null)

  async function signup(dto: SignupDto): Promise<void> { ... }
  async function login(dto: LoginDto): Promise<void> { ... }
  async function logout(): Promise<void> { ... }
  async function checkSession(): Promise<void> { ... } // called on app mount
  function getToken(): string | null { ... }

  return { user, token, isAuthenticated, signup, login, logout, checkSession, getToken }
})
```

- `signup`/`login`: call API, store token + user, persist token in `localStorage` (under a separate key from resume data) so the session survives page refresh
- `logout`: call API, clear token + user, clear token from localStorage
- `checkSession`: if token exists in localStorage, call `GET /api/v1/auth/me` to validate it, restore user or clear on failure

### File: `frontend/src/features/auth/composables/useAuth.ts`

Composable that wraps the auth store for components, providing reactive `isAuthenticated`, `user`, `login`, `signup`, `logout`.

### Anonymous-to-Authenticated Transition

In `useAuthStore.login()` and `useAuthStore.signup()`, after the API call succeeds:

1. Read the full resume payload from `localStorage` (the resume data key)
2. If data exists, call `POST /api/v1/resumes` with the payload
3. On success, clear the resume data from `localStorage`
4. Load the newly created resume into the resume store

### File: `frontend/src/router/index.ts`

Add routes:
```typescript
{
  path: '/login',
  name: 'login',
  component: () => import('@/features/auth/LoginView.vue'),
},
{
  path: '/signup',
  name: 'signup',
  component: () => import('@/features/auth/SignupView.vue'),
}
```

### File: `frontend/src/App.vue`

On mount, call `useAuthStore().checkSession()` to restore the session from localStorage token.

### File: `frontend/src/shared/composables/useApi.ts`

Create a lightweight `useApi` composable:
- Base URL from `import.meta.env.VITE_API_BASE_URL` (default `http://localhost:3000`)
- `get(path)`, `post(path, body)`, `put(path, body)` methods
- Attaches `Authorization: Bearer <token>` header if the auth store has a token
- Returns typed JSON responses
- Throws on non-2xx responses with the error body

### Environment: `frontend/.env`

```env
VITE_API_BASE_URL=http://localhost:3000
```

### File: `frontend/env.d.ts`

Add `VITE_API_BASE_URL` to `ImportMetaEnv`.

## Acceptance Criteria
- [ ] `/login` page renders a form with email and password fields
- [ ] Submitting valid credentials calls the API, stores the token, and redirects to `/builder`
- [ ] `/signup` page renders a form with email, password, and confirm password fields
- [ ] Submitting with an existing email shows the duplicate email error from the API
- [ ] On successful signup from anonymous mode, localStorage resume data is POSTed to the backend, then cleared from localStorage
- [ ] Navigating to `/login` or `/signup` while authenticated redirects to `/builder`
- [ ] `GET /api/v1/auth/me` with token in localStorage returns 401 → token is cleared, user is logged out
- [ ] Page refresh with valid token restores the authenticated session without re-entering credentials
- [ ] Logout clears the token from localStorage and navigates to `/`

## Technical Notes
- The `useApi` composable must handle the auth token attachment — every API call checks the store for a token
- Anon resume data is keyed separately from the auth token in localStorage so they don't collide
- The auth token is persisted across page refreshes via localStorage, but never sent to the backend except as a Bearer token
- Password confirm field is client-side only validation — the API doesn't receive it
```

---

### T-006: [RES] Implement resume CRUD endpoints with encrypted field storage

**Epic:** Create and edit resume content
**Type:** backend
**Depends on:** T-003, T-004

```
ref: T-003 T-004

## Summary
Build the Resumes module with full CRUD endpoints for managing resumes, their sections, entries, and fields. All SectionField values must be encrypted on write and decrypted on read via CryptoService. The POST endpoint handles the bulk import from anonymous localStorage (creating the full resume tree in one call). The PUT endpoint handles incremental updates to layout, sections, entries, and fields.

## What to Build

### Directory: `backend/src/features/resumes/`

```bash
npx nest generate module features/resumes
npx nest generate controller features/resumes
npx nest generate service features/resumes
```

### File: `backend/src/features/resumes/resumes.module.ts`

Import `DatabaseModule`, `CryptoModule`. Provide `ResumesService`.

### File: `backend/src/features/resumes/resumes.service.ts`

Implement:

- **findAll(userId: string): Promise<ResumeSummary[]>**
  - Return all resumes for the user (id, layout, name, createdAt, updatedAt — no section data)
  - Used for listing (future multi-resume support)

- **findOne(id: string, userId: string): Promise<FullResume>**
  - Fetch the Resume with all nested relations: sections → entries → fields and entries → children → fields
  - Decrypt all `SectionField.value` fields using `CryptoService.decrypt()`
  - Throw `NotFoundException` if the resume doesn't exist or doesn't belong to the user

- **create(userId: string, dto: CreateResumeDto): Promise<FullResume>**
  - Accept a full resume payload: `{ layout, sections: [{ sectionId, column, order, entries: [{ order, fields: [{ key, value }], children: [...] }] }] }`
  - Create Resume + ResumeSection rows + SectionEntry rows (with parent/child hierarchy) + SectionField rows
  - Encrypt every `SectionField.value` with `CryptoService.encrypt()` before saving
  - Return the created resume with decrypted fields
  - Wrap in a Prisma transaction so the entire tree is atomic

- **update(id: string, userId: string, dto: UpdateResumeDto): Promise<FullResume>**
  - Update `layout` and `name` on the Resume row
  - Replace sections entirely: delete existing sections/entries/fields for this resume, re-create from the DTO
  - Encrypt all field values before saving
  - Wrap in a transaction
  - Throw `NotFoundException` if the resume doesn't exist or doesn't belong to the user

### File: `backend/src/features/resumes/dto/create-resume.dto.ts`

```typescript
class SectionFieldDto {
  @IsString() key: string;
  @IsString() value: string; // plaintext — service encrypts
  @IsNumber() @IsOptional() order?: number;
}

class SectionEntryDto {
  @IsNumber() @IsOptional() order?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SectionFieldDto) fields: SectionFieldDto[];
  @IsArray() @IsOptional() @ValidateNested({ each: true }) @Type(() => SectionEntryDto) children?: SectionEntryDto[];
}

class ResumeSectionDto {
  @IsString() sectionId: string;
  @IsString() @IsOptional() column?: string;
  @IsNumber() @IsOptional() order?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => SectionEntryDto) entries: SectionEntryDto[];
}

export class CreateResumeDto {
  @IsString() @IsOptional() layout?: string;
  @IsString() @IsOptional() name?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => ResumeSectionDto) sections: ResumeSectionDto[];
}
```

### File: `backend/src/features/resumes/dto/update-resume.dto.ts`

Same as `CreateResumeDto` but all fields optional via `@IsOptional()`.

### File: `backend/src/features/resumes/resumes.controller.ts`

```typescript
@Controller('resumes')
@UseGuards(AuthGuard)
export class ResumesController {
  @Get()
  findAll(@Req() req: AuthenticatedRequest): Promise<ResumeSummary[]> { ... }

  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: AuthenticatedRequest): Promise<FullResume> { ... }

  @Post()
  create(@Body() dto: CreateResumeDto, @Req() req: AuthenticatedRequest): Promise<FullResume> { ... }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateResumeDto, @Req() req: AuthenticatedRequest): Promise<FullResume> { ... }
}
```

### File: `backend/src/features/resumes/resumes.service.spec.ts`

Tests for service methods using mocked PrismaService and CryptoService.

## Acceptance Criteria
- [ ] `GET /api/v1/resumes` returns an array of resume summaries for the authenticated user
- [ ] `GET /api/v1/resumes/:id` returns the full resume tree with all nested relations and decrypted field values
- [ ] `GET /api/v1/resumes/:id` returns 404 for another user's resume
- [ ] `POST /api/v1/resumes` with a full payload creates the entire tree in one transaction
- [ ] All SectionField values are encrypted in the database (verify by querying dev.db directly)
- [ ] `POST /api/v1/resumes` returns decrypted field values in the response
- [ ] `PUT /api/v1/resumes/:id` replaces all sections/entries/fields atomically
- [ ] `PUT /api/v1/resumes/:id` on a non-existent resume returns 404
- [ ] All endpoints require authentication (return 401 without a valid token)
- [ ] Validation rejects malformed DTOs with 400

## Technical Notes
- Use `this.prisma.$transaction([...])` for atomic create/update operations
- When updating, use `deleteMany` on section entries and fields before inserting new ones — easier than diffing
- The nested DTO validation with `@ValidateNested` requires `@Type(() => ...)` from `class-transformer`
- Decrypted values should never be accidentally logged — be careful with Pino logging in this service
- The `FullResume` response type should exclude the raw encrypted values from the response shape — only decrypted values go out
```

---

### T-007: [BUILD] Create ResumeBuilder page shell with layout picker and section toggling

**Epic:** Create and edit resume content
**Type:** frontend
**Depends on:** T-005, T-006

```
ref: T-005 T-006

## Summary
Create the `/builder` route and the ResumeBuilder page shell. Implement the top-level controls: a layout picker (Standard vs 2:1 column), a section toggle list where users enable/disable sections and assign each to the left or right column (for 2:1 layout). Implement the `useResumeData` composable that abstracts localStorage reads/writes for anonymous users and API calls for authenticated users. Show the anonymous mode notice banner.

## What to Build

### File: `frontend/src/features/builder/ResumeBuilder.vue`

The main builder view, accessible at `/builder`. Layout:

```
┌──────────────────────────────────────────────────────────┐
│  [Anonymous notice banner — shown when not signed in]     │
├──────────┬──────────────────────────┬────────────────────┤
│          │                          │                    │
│  Layout  │   Section Editor Area    │   Live Preview     │
│  Picker  │   (placeholder for       │   (placeholder     │
│          │    T-008)                │    for T-009)      │
│  Section │                          │                    │
│  Toggles │                          │                    │
│          │                          │                    │
├──────────┴──────────────────────────┴────────────────────┤
│  JD Input + Tailor button (placeholder for T-012)         │
└──────────────────────────────────────────────────────────┘
```

Three-column layout using CSS Grid or Flexbox. The section editor area and preview are placeholders that T-008 and T-009 will fill.

### File: `frontend/src/features/builder/components/LayoutPicker.vue`

- Two selectable cards: "Standard" (single column) and "2:1 Column"
- Selected layout is highlighted
- Updates the resume store's `layout` field
- Preview of each layout as a simple wireframe icon

### File: `frontend/src/features/builder/components/SectionToggles.vue`

- List of all 10 section types with a toggle switch each
- When 2:1 column layout is selected, each enabled section also shows a left/right column dropdown
- Sections are draggable to reorder (or use up/down arrow buttons)
- Sections that are toggled off are hidden from the editor and preview
- When toggling a section on, it initializes with default empty data

### File: `frontend/src/features/builder/components/AnonymousBanner.vue`

- Shown at the top of the builder only when `useAuthStore().isAuthenticated` is false
- Text: *"You're not signed in. Your resume is saved only in this browser. Sign up to save it permanently."*
- "Sign Up" and "Log In" buttons that navigate to `/signup` and `/login`
- Dismissible with a close button (uses a dismissed flag in sessionStorage, not localStorage, so it resets per session)

### File: `frontend/src/features/builder/composables/useResumeData.ts`

Central composable that abstracts resume storage:

```typescript
export function useResumeData() {
  const authStore = useAuthStore()
  const resumeStore = useResumeStore()

  const RESUME_STORAGE_KEY = 'resume-v3-data'

  function loadResume(): Promise<void> {
    if (authStore.isAuthenticated) {
      // GET /api/v1/resumes → pick first → GET /api/v1/resumes/:id
      // populate resumeStore
    } else {
      // read from localStorage[RESUME_STORAGE_KEY]
      // populate resumeStore with default structure if empty
    }
  }

  function saveResume(): Promise<void> {
    if (authStore.isAuthenticated) {
      // PUT /api/v1/resumes/:id or POST /api/v1/resumes (if first save)
    } else {
      // write resumeStore data to localStorage[RESUME_STORAGE_KEY]
    }
  }

  // Debounced auto-save: watches resumeStore, calls saveResume() after 2s of inactivity
  // For anon: immediate localStorage write on every change

  return { loadResume, saveResume }
}
```

### File: `frontend/src/features/builder/stores/resume.ts`

Pinia setup store `useResumeStore`:

```typescript
export const useResumeStore = defineStore('resume', () => {
  const id = ref<string | null>(null)
  const layout = ref<'standard' | '2:1-column'>('standard')
  const name = ref<string | null>(null)
  const sections = ref<ResumeSectionState[]>([])

  // Getters
  const enabledSections = computed(() => sections.value.filter(s => s.enabled))
  const leftColumnSections = computed(() => enabledSections.value.filter(s => s.column === 'left'))
  const rightColumnSections = computed(() => enabledSections.value.filter(s => s.column === 'right'))

  // Actions
  function setLayout(l: 'standard' | '2:1-column') { ... }
  function toggleSection(sectionId: string) { ... }
  function setSectionColumn(sectionId: string, column: 'left' | 'right') { ... }
  function reorderSections(fromIndex: number, toIndex: number) { ... }
  function loadFromPayload(payload: ResumePayload) { ... }
  function toPayload(): ResumePayload { ... }

  // Default sections: all 10, enabled by default, right column
  function initializeDefaults() { ... }

  return { id, layout, name, sections, enabledSections, leftColumnSections, rightColumnSections, ... }
})
```

### File: `frontend/src/features/builder/types/resume.ts`

Type definitions for `ResumePayload`, `ResumeSectionState`, `SectionEntryState`, `SectionFieldState`, matching the API DTOs.

### File: `frontend/src/router/index.ts`

Add route:
```typescript
{
  path: '/builder',
  name: 'builder',
  component: () => import('@/features/builder/ResumeBuilder.vue'),
}
```

## Acceptance Criteria
- [ ] `/builder` renders the three-column layout with layout picker, section toggles, editor placeholder, and preview placeholder
- [ ] Clicking "Standard" sets the layout and updates the resume store
- [ ] Clicking "2:1 Column" reveals column assignment controls on each section toggle
- [ ] Toggling a section off hides it; toggling it back on restores it with default empty data
- [ ] Assigning sections to left/right columns works and is reflected in the store
- [ ] Anonymous users see the notice banner at the top
- [ ] Anonymous users' resume data persists in localStorage and survives a page refresh
- [ ] Authenticated users' resume data loads from the API on page load
- [ ] Dismissing the anonymous banner hides it for the session
- [ ] The resume store's `toPayload()` produces a payload that matches the `CreateResumeDto` shape

## Technical Notes
- The default resume structure should initialize all 10 sections in the store, with empty entries
- localStorage read/write should be wrapped in try/catch — corrupted data triggers a reset to defaults
- The 2:1 layout: narrow (1/3) column on the left, wide (2/3) on the right per the spec
- Use `watch` with `{ deep: true }` on the resume store for auto-save, with debounce for API calls
- The `useResumeData` composable is the single entry point for load/save — no component should touch localStorage or API directly
```

---

### T-008: [BUILD] Implement section editors for all 10 section types

**Epic:** Create and edit resume content
**Type:** frontend
**Depends on:** T-007

```
ref: T-007

## Summary
Build the dynamic section editing area in the ResumeBuilder. Create a generic section editor that renders the correct form fields based on the section type. Implement inline editing for all 10 section types including add/remove/reorder for entries (e.g., multiple jobs, multiple skills) and bullet points for experience and projects. All edits update the resume store reactively, which triggers the live preview.

## What to Build

### File: `frontend/src/features/builder/components/SectionEditor.vue`

The main editor area. Renders one section at a time — the user picks which section to edit from the SectionToggles sidebar, or all enabled sections are shown stacked in a scrollable list.

For each enabled section, render the appropriate editor component based on `sectionId`:

```
<NameContactEditor v-if="section.sectionId === 'name_contact'" ... />
<SummaryEditor v-if="section.sectionId === 'summary'" ... />
<ExperienceEditor v-if="section.sectionId === 'experience'" ... />
<EducationEditor v-if="section.sectionId === 'education'" ... />
<HardSkillsEditor v-if="section.sectionId === 'hard_skills'" ... />
<SoftSkillsEditor v-if="section.sectionId === 'soft_skills'" ... />
<CertificationsEditor v-if="section.sectionId === 'certifications'" ... />
<ProjectsEditor v-if="section.sectionId === 'projects'" ... />
<LanguagesEditor v-if="section.sectionId === 'languages'" ... />
<HobbiesEditor v-if="section.sectionId === 'hobbies'" ... />
```

### Section Editor Components

Each editor receives the section's entries as a prop and emits updates to the resume store.

#### NameContactEditor (`frontend/src/features/builder/components/editors/NameContactEditor.vue`)
- Single entry with text inputs for: Full Name (required), Email, Phone, Location, LinkedIn URL, Website
- All fields except Name are optional

#### SummaryEditor (`frontend/src/features/builder/components/editors/SummaryEditor.vue`)
- Single textarea for the summary text
- Character count display (no hard limit, just informational)

#### ExperienceEditor (`frontend/src/features/builder/components/editors/ExperienceEditor.vue`)
- Add/remove job entries (each entry = one job)
- Fields per job: Company, Title, Start Date, End Date, Location
- Each job has bullet points: add/remove/reorder bullet text fields
- "Add Bullet" button appends a new empty bullet point
- Drag or up/down buttons to reorder job entries and bullet points
- "Current position" checkbox that disables the End Date field

#### EducationEditor (`frontend/src/features/builder/components/editors/EducationEditor.vue`)
- Add/remove education entries
- Fields per entry: School, Degree, Field of Study, Start Date, End Date

#### HardSkillsEditor (`frontend/src/features/builder/components/editors/HardSkillsEditor.vue`)
- Single entry with a list of skill name text inputs
- "Add Skill" button appends an empty skill input
- Remove button (X) on each skill
- Inline editing — typing in a skill field updates the store immediately

#### SoftSkillsEditor (`frontend/src/features/builder/components/editors/SoftSkillsEditor.vue`)
- Identical structure to HardSkillsEditor — list of skill names

#### CertificationsEditor (`frontend/src/features/builder/components/editors/CertificationsEditor.vue`)
- Add/remove certification entries
- Fields per entry: Name, Issuer, Date

#### ProjectsEditor (`frontend/src/features/builder/components/editors/ProjectsEditor.vue`)
- Add/remove project entries
- Fields per entry: Name, Description (textarea), URL, Start Date, End Date
- Each project has bullet points (same pattern as ExperienceEditor)
- "Add Bullet" button per project

#### LanguagesEditor (`frontend/src/features/builder/components/editors/LanguagesEditor.vue`)
- List of language entries
- Fields per language: Language Name (text), Proficiency (dropdown: Elementary, Limited Working, Professional Working, Full Professional, Native/Bilingual)

#### HobbiesEditor (`frontend/src/features/builder/components/editors/HobbiesEditor.vue`)
- Simple list of hobby name text inputs with add/remove

### Shared Components

#### `frontend/src/features/builder/components/shared/EntryList.vue`
Reusable component for sections that have multiple entries (Experience, Education, Certifications, Projects):
- Renders a list of entry panels
- Add/remove buttons
- Drag reorder or up/down move buttons
- Each entry panel is collapsible (accordion style)
- Slot for the entry's form fields

#### `frontend/src/features/builder/components/shared/BulletList.vue`
Reusable component for bullet point management used by Experience and Projects editors:
- Add bullet button
- Remove (X) button per bullet
- Drag reorder or up/down buttons
- Text input per bullet with placeholder text

### File: `frontend/src/features/builder/composables/useSectionEditor.ts`

Composable providing shared logic for section editors:
- `addEntry(sectionId: string)` — appends a new empty entry to the section
- `removeEntry(sectionId: string, entryIndex: number)` — removes an entry
- `updateField(sectionId: string, entryIndex: number, key: string, value: string)` — updates a field value
- `addBullet(sectionId: string, entryIndex: number)` — appends a child entry with key `bullet_text`
- `removeBullet(sectionId: string, entryIndex: number, bulletIndex: number)` — removes a child entry
- `reorderEntries(sectionId: string, fromIndex: number, toIndex: number)` — moves an entry
- `reorderBullets(sectionId: string, entryIndex: number, fromIndex: number, toIndex: number)` — moves a bullet

All mutations go through the resume store — no direct state mutation in components.

## Acceptance Criteria
- [ ] Name/Contact editor shows all 6 fields; only Name is required
- [ ] Summary editor shows a textarea with character count
- [ ] Experience editor supports adding/removing job entries and bullet points per job
- [ ] "Current position" checkbox disables End Date
- [ ] Education editor supports adding/removing school entries
- [ ] Hard Skills and Soft Skills editors support adding/removing skill names with inline editing
- [ ] Certifications editor supports adding/removing entries with Name, Issuer, Date
- [ ] Projects editor supports entries + bullet points (same pattern as Experience)
- [ ] Languages editor has a proficiency dropdown per language
- [ ] Hobbies editor supports adding/removing hobby names
- [ ] All edits update the resume store immediately (triggers preview refresh)
- [ ] Reordering entries and bullets works (up/down or drag)
- [ ] Collapsing an entry hides its fields but keeps the header visible
- [ ] Removing an entry with data shows a confirmation prompt before deleting
- [ ] Empty sections show a "No [section name] added yet" placeholder with an add button

## Technical Notes
- All editor components use `v-model` on the resume store (via computed get/set) — changes propagate instantly
- Date fields should use `<input type="month">` or a simple text input with MM/YYYY format
- The proficiency dropdown options: Elementary, Limited Working, Professional Working, Full Professional, Native/Bilingual
- Bullet points for Experience and Projects use the same SectionEntry children pattern — the editor should match this structure
- Section editors should be lazy-loaded (`defineAsyncComponent`) since there are 10 of them
- Confirmation before removing an entry should use a simple `window.confirm()` or a custom modal
- Phone number, email, and URL fields should use the appropriate input types (`type="tel"`, `type="email"`, `type="url"`) for mobile keyboard optimization
```

---

### T-009: [PREVIEW] Create live preview pane rendering the selected layout

**Epic:** View live preview and export PDF
**Type:** frontend
**Depends on:** T-007

```
ref: T-007

## Summary
Build the live preview pane that renders the resume as it will look on paper. The preview is a reactive, print-styled HTML rendering of the resume store data. It supports both the Standard (single column) and 2:1 column layouts. Updates happen immediately as the user types in the editors — no save button, no refresh.

## What to Build

### File: `frontend/src/features/builder/components/LivePreview.vue`

The preview component receives the full resume state from the resume store and renders it as a US Letter sized (8.5" × 11") document preview.

**Container:**
- White background, US Letter aspect ratio
- Scales to fit the preview pane width
- Box shadow to simulate a paper sheet
- `@media print` styles for actual printing (though PDF export uses html2canvas, good print CSS is still valuable)

### File: `frontend/src/features/builder/components/preview/StandardLayout.vue`

Renders the resume in a single-column layout:

```
┌──────────────────────────────────┐
│         NAME & CONTACT           │
│  email | phone | location | ... │
├──────────────────────────────────┤
│  SUMMARY                         │
│  Summary text here...            │
├──────────────────────────────────┤
│  EXPERIENCE                      │
│  Company — Title                  │
│  • Bullet point 1                │
│  • Bullet point 2                │
├──────────────────────────────────┤
│  EDUCATION                       │
│  School — Degree                 │
├──────────────────────────────────┤
│  (remaining sections in order)   │
└──────────────────────────────────┘
```

### File: `frontend/src/features/builder/components/preview/TwoColumnLayout.vue`

Renders the resume with a 1/3 left column and 2/3 right column:

```
┌──────────┬───────────────────────┐
│ LEFT     │ RIGHT                 │
│ (1/3)    │ (2/3)                │
│          │                       │
│ Name &   │ Summary               │
│ Contact  │                       │
│          │ Experience            │
│ Skills   │                       │
│          │ Education             │
│ Langs    │                       │
│          │ Projects              │
│ Hobbies  │                       │
│          │                       │
└──────────┴───────────────────────┘
```

Sections are placed in the left or right column based on their `column` assignment in the resume store.

### Section Rendering

Each section type has a preview component that renders its data in a print-friendly format:

| Section | Preview Rendering |
|---------|-------------------|
| name_contact | Name in large bold font, contact details in a smaller single line below, separated by pipes or bullets |
| summary | Section heading + paragraph text |
| experience | Section heading + per job: Company in bold, Title, dates right-aligned, location, bullet points below |
| education | Section heading + per school: School in bold, Degree, Field of Study, dates right-aligned |
| hard_skills | Section heading + comma-separated list or inline tags |
| soft_skills | Same as hard skills |
| certifications | Section heading + per cert: Name, Issuer, Date |
| projects | Section heading + per project: Name in bold, description, URL, bullet points |
| languages | Section heading + per language: Language name with proficiency in parentheses |
| hobbies | Section heading + comma-separated list |

### Section Ordering

Sections appear in the order defined by the resume store's section ordering (from the SectionToggles reorder).

### Empty State

If no sections are enabled or no data is entered, show a blank page with a light watermark: "Your resume preview will appear here."

### File: `frontend/src/features/builder/components/preview/PreviewSection.vue`

Generic section wrapper:
- Section heading with a horizontal rule or underline
- Consistent typography (font sizes, weights, spacing)
- Handles the section label display

### File: `frontend/src/features/builder/components/preview/PreviewBulletList.vue`

Renders bullet points with proper indentation and bullet characters.

### Typography & Styling

- Use a clean, print-friendly font stack: `'Georgia', 'Times New Roman', serif` for body, or a sans-serif for a modern look
- Font sizes: Name ~18pt, section headings ~12pt bold, body ~10pt
- Colors: black text on white, section headings optionally in a dark accent color
- Margins and padding should mimic real resume spacing

## Acceptance Criteria
- [ ] Preview shows a US Letter sized document preview
- [ ] Standard layout renders all enabled sections in a single column
- [ ] 2:1 Column layout places sections in the correct column based on their assignment
- [ ] Switching layouts updates the preview immediately
- [ ] Toggling a section off removes it from the preview
- [ ] Typing in any editor field updates the preview in real-time (no manual refresh)
- [ ] Reordering sections in the toggle sidebar reorders them in the preview
- [ ] Name displays prominently; contact details display inline
- [ ] Experience entries show company, title, dates, location, and bullet points
- [ ] Skills render as comma-separated or tag-style
- [ ] Languages show proficiency in parentheses
- [ ] Empty sections do not render (no empty headings)
- [ ] Empty resume shows the watermark message
- [ ] Preview is print-friendly (test with browser print preview)

## Technical Notes
- The preview reads exclusively from the resume store — it's a pure rendering of state
- Use Vue's `computed` to derive the ordered, filtered section list for rendering
- The preview should NOT be editable — it's display-only
- Keep the preview DOM clean and simple — it will be captured by html2canvas for PDF export (T-010)
- Avoid CSS that html2canvas can't render: no CSS Grid in the preview (use flexbox or floats), no `backdrop-filter`, no `mix-blend-mode`
- Use an `id` attribute on the preview container (`id="resume-preview"`) for html2canvas targeting
- The scaling approach: render at full US Letter pixel size (e.g., 816px × 1056px at 96 DPI), then use CSS `transform: scale()` to fit the preview pane
```

---

### T-010: [PDF] Implement client-side PDF export via jsPDF and html2canvas

**Epic:** View live preview and export PDF
**Type:** frontend
**Depends on:** T-009

```
ref: T-009

## Summary
Add PDF export functionality to the builder. When the user clicks "Download PDF", capture the live preview DOM via html2canvas, generate a multi-page PDF using jsPDF that matches the preview exactly, and trigger a browser download. The PDF must handle page breaks across sections and maintain the same visual fidelity as the on-screen preview.

## What to Build

### Dependencies

```bash
cd frontend
pnpm add jspdf html2canvas
pnpm add -D @types/jspdf  # if available
```

### File: `frontend/src/features/builder/composables/usePdfExport.ts`

```typescript
export function usePdfExport() {
  const isExporting = ref(false)
  const exportError = ref<string | null>(null)

  async function exportPdf(filename: string = 'resume.pdf'): Promise<void> {
    isExporting.value = true
    exportError.value = null

    try {
      const previewElement = document.getElementById('resume-preview')
      if (!previewElement) throw new Error('Preview element not found')

      // 1. Capture the preview as a canvas
      const canvas = await html2canvas(previewElement, {
        scale: 2,           // 2x for crisp text
        useCORS: true,      // for any external images
        logging: false,
        backgroundColor: '#ffffff',
      })

      // 2. Calculate dimensions
      const imgWidth = 210  // A4 width in mm
      const pageHeight = 297 // A4 height in mm
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      const imgData = canvas.toDataURL('image/png')

      // 3. Create PDF
      const pdf = new jsPDF('p', 'mm', 'a4')
      let heightLeft = imgHeight
      let position = 0

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight

      // 4. Handle multi-page
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }

      // 5. Download
      pdf.save(filename)
    } catch (error) {
      exportError.value = error instanceof Error ? error.message : 'PDF export failed'
    } finally {
      isExporting.value = false
    }
  }

  return { exportPdf, isExporting, exportError }
}
```

### File: `frontend/src/features/builder/components/PdfExportButton.vue`

- "Download PDF" button in the builder toolbar
- Shows a loading spinner while exporting (`isExporting`)
- Disabled state while exporting
- Shows error message if export fails
- Calls `usePdfExport().exportPdf()`

### Place the button in `ResumeBuilder.vue`

Add the PDF export button to the builder toolbar area (top or bottom of the page).

### Page Break Handling

The default html2canvas approach captures the preview as one tall image, then slices it into A4 pages. For better page breaks:

**Option A (simple — implement this):** Slice the single canvas into A4-height chunks. Text may be cut mid-line, but this works for V1.

**Option B (better — future):** Capture each section individually and compose them into a PDF with `jsPDF`'s text/layout APIs. This handles page breaks cleanly but requires more work.

Implement Option A for this ticket.

### File: `frontend/src/features/builder/components/PdfExportButton.spec.ts`

Unit test:
- Verify the button renders and is clickable
- Mock `html2canvas` and `jsPDF` to verify they're called
- Verify loading state is shown during export

## Acceptance Criteria
- [ ] "Download PDF" button is visible in the builder
- [ ] Clicking the button triggers a `.pdf` file download
- [ ] The PDF visually matches the on-screen preview (same layout, fonts, content)
- [ ] Multi-page resumes (content longer than one A4 page) are split across pages
- [ ] The button shows a loading state while generating the PDF
- [ ] The button is disabled during export (prevents double clicks)
- [ ] Export failure shows an error message
- [ ] Anonymous users can export without signing in (uses localStorage data)
- [ ] The PDF uses A4 paper size, portrait orientation

## Technical Notes
- html2canvas `scale: 2` doubles the resolution for sharper text in the PDF
- The preview element must have `id="resume-preview"` (set in T-009)
- US Letter vs A4: jsPDF supports both. A4 (210×297mm) is the default and widely used
- File size: a typical 2-page resume should be under 500KB
- The PDF filename defaults to `resume.pdf` — consider using the user's name from name_contact if available
- html2canvas limitations: no CSS Grid, no `backdrop-filter`, no `mix-blend-mode`, limited web font support. The preview (T-009) should already account for this
- If the preview uses `transform: scale()`, html2canvas captures at the unscaled size — verify dimensions in testing
```

---

### T-011: [TAILOR] Implement JD tailoring endpoint with configurable matching engine

**Epic:** Tailor resume to a job description
**Type:** backend
**Depends on:** T-006

```
ref: T-006

## Summary
Build the `/api/v1/resumes/tailor` endpoint that accepts a resume payload and a job description string, then returns the same resume structure with bullet points and skills filtered to the most relevant ones based on the JD. The matching strategy is configurable via the `MATCHING_ENGINE` environment variable: keyword (TF-IDF token overlap), LLM (sends to an LLM API for ranking), or hybrid (keyword pre-filter then LLM re-rank).

## What to Build

### File: `backend/src/features/tailor/tailor.module.ts`

```bash
npx nest generate module features/tailor
npx nest generate controller features/tailor
npx nest generate service features/tailor
```

Import `ConfigModule`. Provide `TailorService`. No database dependency — this is a stateless computation.

### File: `backend/src/features/tailor/tailor.service.ts`

Implement the matching engine:

```typescript
@Injectable()
export class TailorService {
  private readonly engine: MatchingEngine;

  constructor(private readonly configService: ConfigService<Env>) {
    const mode = this.configService.getOrThrow('MATCHING_ENGINE');
    this.engine = this.createEngine(mode);
  }

  async tailor(dto: TailorRequestDto): Promise<TailorResponseDto> {
    return this.engine.match(dto);
  }
}
```

### Matching Engine Strategies

Create a strategy interface and three implementations:

#### `backend/src/features/tailor/engines/matching-engine.interface.ts`

```typescript
interface MatchingEngine {
  match(request: TailorRequestDto): Promise<TailorResponseDto>;
}
```

#### Keyword Engine (`backend/src/features/tailor/engines/keyword.engine.ts`)

1. Tokenize the JD: lowercase, remove stop words, keep unique tokens
2. For each experience entry's bullet points: compute a relevance score as the count of JD tokens found in the bullet text divided by bullet length (simple TF overlap)
3. For hard skills: score each skill name against JD tokens
4. For soft skills: score each skill name against JD tokens
5. Sort by score descending, take top N (where N = `BULLET_CAP` for bullets, all skills above a threshold or top N)
6. Return the filtered structure — only include bullets/skills that meet the relevance threshold
7. Fields that aren't bullet points or skills pass through unchanged

#### LLM Engine (`backend/src/features/tailor/engines/llm.engine.ts`)

1. Build a prompt with: job description, list of bullet points per experience entry (with indices), list of hard skills, list of soft skills, and the bullet cap
2. Call the LLM API (OpenAI-compatible) with the prompt asking it to return a JSON object with the most relevant bullets and skills
3. Parse the JSON response
4. Return the filtered structure

Prompt template:
```
You are a resume tailoring assistant. Given a job description and a candidate's resume content, select the most relevant items.

Job Description:
<JD>

Experience Bullet Points:
<numbered list of bullets per job>

Hard Skills:
<list>

Soft Skills:
<list>

Return ONLY a JSON object with this structure:
{
  "experience": [{ "entryIndex": 0, "bulletIndices": [0, 2, 5] }, ...],
  "hardSkills": ["skill1", "skill3"],
  "softSkills": ["skill1", "skill2"]
}

Select up to <BULLET_CAP> bullets per experience entry. Only include skills that appear in or are directly implied by the job description.
```

#### Hybrid Engine (`backend/src/features/tailor/engines/hybrid.engine.ts`)

1. Run the keyword engine to get a pre-filtered set (top 2× BULLET_CAP bullets, all skills above threshold)
2. Send only the pre-filtered set to the LLM for final ranking
3. Return the LLM's filtered results

### File: `backend/src/features/tailor/dto/tailor-request.dto.ts`

```typescript
export class TailorRequestDto {
  @IsString()
  jobDescription: string;

  @IsObject()
  resume: ResumePayload; // same shape as the resume store payload — sections with entries and fields
}
```

### File: `backend/src/features/tailor/dto/tailor-response.dto.ts`

```typescript
export class TailorResponseDto {
  sections: TailoredSectionDto[];
}

class TailoredSectionDto {
  sectionId: string;
  entries: TailoredEntryDto[];
}

class TailoredEntryDto {
  order: number;
  fields: { key: string; value: string }[];
  children: TailoredEntryDto[]; // filtered bullets/skills
}
```

### File: `backend/src/features/tailor/tailor.controller.ts`

```typescript
@Controller('resumes')
export class TailorController {
  @Post('tailor')
  tailor(@Body() dto: TailorRequestDto): Promise<TailorResponseDto> {
    return this.tailorService.tailor(dto);
  }
}
```

No auth required — this endpoint accepts resume data + JD in the body.

### File: `backend/src/features/tailor/tailor.service.spec.ts`

- Keyword engine: verify bullets containing JD tokens score higher than unrelated bullets
- Keyword engine: verify BULLET_CAP limits the number of returned bullets
- LLM engine: mock the API call, verify the prompt includes the JD and bullets
- Hybrid engine: verify keyword pre-filter reduces the LLM input size
- Edge case: empty JD returns all bullets/skills unfiltered
- Edge case: JD with no matching tokens returns empty bullets/skills

## Acceptance Criteria
- [ ] `POST /api/v1/resumes/tailor` with a JD returns filtered bullets and skills
- [ ] Keyword mode: bullets containing JD keywords are ranked higher
- [ ] Keyword mode: number of bullets per entry is capped at `BULLET_CAP`
- [ ] LLM mode: calls the LLM API with the correct prompt and parses the JSON response
- [ ] Hybrid mode: pre-filters with keyword before calling LLM
- [ ] `MATCHING_ENGINE=keyword` uses keyword engine (no API call)
- [ ] `MATCHING_ENGINE=llm` uses LLM engine (requires LLM_API_KEY)
- [ ] `MATCHING_ENGINE=hybrid` uses hybrid engine
- [ ] Non-bullet, non-skill fields pass through unchanged
- [ ] Endpoint does NOT require authentication
- [ ] Empty JD returns all items unfiltered
- [ ] Missing `LLM_API_KEY` with `llm` or `hybrid` mode returns a clear error

## Technical Notes
- The LLM engine should use the OpenAI-compatible chat completions API. Base URL should be configurable (default `https://api.openai.com/v1`)
- Use `this.configService.get('LLM_API_KEY')` and throw if missing when engine is llm or hybrid
- The keyword engine should be 100% offline — no network calls, no API keys needed. Pure string processing
- Stop words list: common English words (the, a, an, in, on, at, to, for, of, with, and, or, is, are, was, were, be, been, being, have, has, had, do, does, did, will, would, shall, should, may, might, must, can, could, I, you, he, she, it, we, they, me, him, her, us, them, my, your, his, its, our, their, this, that, these, those, not, no, nor, so, very, just, about, also, etc.)
- The strategy pattern allows easy addition of new engines in the future without changing the controller or service interface
- The `ResumePayload` type in the DTO should match the structure the frontend sends — sections with entries, fields, and children
```

---

### T-012: [TAILOR] Create JD input component with tailoring integration

**Epic:** Tailor resume to a job description
**Type:** frontend
**Depends on:** T-008, T-011

```
ref: T-008 T-011

## Summary
Add the job description input area to the ResumeBuilder. When the user pastes a JD and clicks "Tailor Resume", the frontend calls `POST /api/v1/resumes/tailor` with the resume data and JD, receives the filtered results, and updates the resume store to show only the relevant bullets and skills. Non-relevant items are hidden (not deleted) so the user can review and restore them.

## What to Build

### File: `frontend/src/features/builder/components/JdInput.vue`

Component at the bottom of the builder (or in a collapsible panel):

```
┌─────────────────────────────────────────────────────────┐
│  Job Description                            [Tailor] [Reset]  │
│  ┌─────────────────────────────────────────────────────┐ │
│  │ Paste or type a job description here...              │ │
│  │                                                     │ │
│  └─────────────────────────────────────────────────────┘ │
│  Filtering: keyword mode  |  Bullet cap: 5                 │
│  ⓘ Relevant bullets and skills will be highlighted.        │
└─────────────────────────────────────────────────────────┘
```

- Textarea for the JD (resizable, min-height 150px)
- "Tailor Resume" button (primary action)
- "Reset Filter" button (secondary, clears filtering and restores all items)
- Info text showing the current filtering mode and bullet cap
- Loading spinner while the API call is in progress

### File: `frontend/src/features/builder/composables/useTailor.ts`

```typescript
export function useTailor() {
  const resumeStore = useResumeStore()
  const { post } = useApi()

  const isTailoring = ref(false)
  const tailorError = ref<string | null>(null)
  const isFiltered = ref(false)

  async function tailorResume(jobDescription: string): Promise<void> {
    isTailoring.value = true
    tailorError.value = null

    try {
      const payload = resumeStore.toPayload()
      const response = await post<TailorResponseDto>('/api/v1/resumes/tailor', {
        jobDescription,
        resume: payload,
      })

      // Apply filtering to the resume store
      applyFilter(response)
      isFiltered.value = true
    } catch (error) {
      tailorError.value = error instanceof Error ? error.message : 'Tailoring failed'
    } finally {
      isTailoring.value = false
    }
  }

  function applyFilter(response: TailorResponseDto): void {
    // For each section in the response, mark entries/bullets as relevant
    // The resume store tracks a `filtered` flag on each entry/child
    // Only relevant items are shown; irrelevant items are hidden (not deleted)
  }

  function resetFilter(): void {
    // Clear all filtered flags — show everything
    isFiltered.value = false
  }

  return { tailorResume, resetFilter, isTailoring, tailorError, isFiltered }
}
```

### Resume Store Updates (`frontend/src/features/builder/stores/resume.ts`)

Add to the resume store:

- `isFiltered: Ref<boolean>` — whether filtering is currently active
- `filteredBulletIndices: Ref<Map<string, number[]>>` — per entry, which bullet indices are relevant
- `filteredHardSkills: Ref<string[]>` — relevant hard skill names
- `filteredSoftSkills: Ref<string[]>` — relevant soft skill names
- `applyTailorFilter(response: TailorResponseDto)` — stores the filter state
- `resetTailorFilter()` — clears the filter state
- `isBulletRelevant(sectionId: string, entryIndex: number, bulletIndex: number): boolean` — getter
- `isSkillRelevant(sectionId: string, skillName: string): boolean` — getter

### Editor Updates

Update ExperienceEditor, ProjectsEditor, HardSkillsEditor, and SoftSkillsEditor to:
- Dim or hide bullets/skills that are filtered out (grey text, reduced opacity, or strikethrough)
- Show a relevance indicator (e.g., a small green dot or checkmark) on relevant bullets
- When filtering is active, show a count: "Showing 3 of 7 bullets (tailored)"
- The "Add Bullet" / "Add Skill" button remains active — the user can always add new items

### Place JdInput in `ResumeBuilder.vue`

Add `<JdInput />` at the bottom of the builder layout, below the section editor area.

## Acceptance Criteria
- [ ] JD textarea is visible in the builder
- [ ] Typing/pasting a JD and clicking "Tailor Resume" calls the API and shows a loading state
- [ ] After tailoring, filtered-out bullets are visually dimmed or hidden in the editor
- [ ] After tailoring, filtered-out skills are visually dimmed or hidden
- [ ] Relevant bullets/skills are highlighted or marked
- [ ] "Reset Filter" restores all items to full visibility
- [ ] The filtering info text updates based on the configured mode and bullet cap
- [ ] API errors show an error message in the JD input area
- [ ] The tailor endpoint is called even for anonymous users (no auth required)
- [ ] Non-bullet, non-skill fields (company names, dates, etc.) are never filtered

## Technical Notes
- The tailored response from the API contains only the relevant item indices/names — not a full resume payload
- Filtering is a view-layer concern: items are hidden in the UI but remain in the resume store (and in localStorage / the database)
- This means the user can toggle filtering on/off without losing any data
- The "Reset Filter" button clears the filter state — no API call needed
- If the user edits filtered-out items (e.g., improves a bullet's wording), those edits persist even though the item is hidden
- The JD text should be cleared when the user navigates away from the builder, but consider saving it in the resume store for convenience during a single session
- For anon users, the tailor call is their only backend interaction — make sure it works without any auth headers
```
