# Milestone: Resume Builder

**Date:** 2026-07-31 15:25:50 UTC
**Status:** Approved

## Summary

A resume builder that lets users choose a layout, select sections, fill in their details, and then have the content intelligently filtered based on a target job description. Anonymous users work entirely offline with data in `localStorage`; authenticated users get server-side persistence. The builder provides a live preview and PDF export.

## User Stories

- As a job seeker, I want to choose between different resume layouts so that my resume matches the role's expectations.
- As a job seeker, I want to toggle which sections appear on my resume so I only include relevant content.
- As a job seeker, I want to provide a job description and have the builder automatically select the most relevant bullet points and skills so my resume is tailored to each application.
- As an anonymous user, I want to build a resume without signing up, with all my data stored locally in my browser so nothing leaves my machine.
- As an anonymous user who has partially built a resume, I want my work saved to my account when I sign up or log in, without losing anything.
- As a job seeker, I want a live preview of my resume as I edit so I can see exactly what the output looks like.
- As a job seeker, I want to export my resume as a PDF so I can submit it to employers.

## Acceptance Criteria

- [ ] User can pick one of two layouts: **Standard** (single column) or **2:1 column**.
- [ ] User can toggle which sections to include and assign each to the left or right column (for 2:1 layout).
- [ ] User can enter/edit all 10 section types: name/contact, summary, experience entries (with many bullet points each), education, hard skills, soft skills, certifications, projects, languages, hobbies.
- [ ] User can paste or type a job description.
- [ ] Builder automatically filters bullet points per experience entry to the most relevant ones based on the JD.
- [ ] Builder automatically filters soft skills and hard skills to the most relevant ones based on the JD.
- [ ] Filtering strategy (keyword / LLM / hybrid) is configurable via an environment-backed config parameter.
- [ ] Live preview updates as the user edits any field.
- [ ] PDF download is available (client-side via jsPDF + html2canvas) and matches the preview.
- [ ] Anonymous users' resume data is stored entirely in `localStorage` — no data is sent to or stored on the backend.
- [ ] A clear notice explains to anonymous users that data is local-only and prompts them to sign up/log in to persist it.
- [ ] When an anonymous user logs in or signs up, the frontend sends the full `localStorage` resume payload to the backend, which creates the user's first resume from it.
- [ ] Authenticated users can save and reload their resume from the backend.

## Scope

### In Scope

- Two layouts: Standard and 2:1 column.
- Section types: Name/Contact, Experience, Education, Hard Skills, Soft Skills, Summary, Certifications, Projects, Languages, Hobbies.
- Section toggling (user picks which sections to include).
- Many bullet points per experience entry.
- JD input and content filtering based on relevance.
- Configurable matching engine (keyword / LLM / hybrid) behind a config parameter.
- Live preview pane.
- PDF export.
- Anonymous + authenticated UX with local-first storage for anon users, server persistence for authenticated users.
- Authentication (sign up, log in, session management).
- All API endpoints versioned under `/api/v1/`.
- PII encrypted at rest (per-field AES-256-GCM) with configurable `ENCRYPTION_KEY`.

### Out of Scope

- Additional layouts beyond the initial two.
- Resume import / parsing (LinkedIn, existing PDF).
- Web scraping for job descriptions.
- Automated JD polling and email notifications for high-fit jobs.
- Template/custom styling beyond the two fixed layouts.
- Multiple resumes per account (schema supports it; UI not in this milestone).

## Technical Approach

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Frontend (Vue)                         │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐      │
│  │ Layout   │  │ Section  │  │ Preview           │      │
│  │ Picker   │  │ Editor   │  │ (live, reactive)  │      │
│  └──────────┘  └──────────┘  └───────────────────┘      │
│                         │                                │
│                    ┌─────┴─────┐  ┌──────────────────┐  │
│                    │ JD Input  │  │ localStorage     │  │
│                    └─────┬─────┘  │ (anon data)      │  │
│                          │        └──────────────────┘  │
│                          │ POST /api/v1/resumes/tailor   │
└──────────────────────────┼──────────────────────────────┘
                           │
┌──────────────────────────┼──────────────────────────┐
│                   Backend (NestJS)                   │
│                          │                           │
│  ┌───────────────────────┴──────────────────────┐   │
│  │              Matching Engine                  │   │
│  │  config: MATCHING_ENGINE = keyword|llm|hybrid │   │
│  └──────────────────────────────────────────────┘   │
│                                                    │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ Auth    │  │ Resume   │  │ CryptoService    │  │
│  │ Module  │  │ CRUD     │  │ (field encrypt)  │  │
│  └─────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/v1/auth/signup` | No | Create account |
| `POST` | `/api/v1/auth/login` | No | Log in, returns session token |
| `POST` | `/api/v1/auth/logout` | Yes | Invalidate session |
| `GET` | `/api/v1/auth/me` | Yes | Get current user |
| `GET` | `/api/v1/resumes` | Yes | List user's resumes |
| `GET` | `/api/v1/resumes/:id` | Yes | Get one resume (with decrypted fields) |
| `POST` | `/api/v1/resumes` | Yes | Create a resume from a full payload (used on first login/signup to import local data, and for saving) |
| `PUT` | `/api/v1/resumes/:id` | Yes | Update resume (layout, sections, entries, fields) |
| `POST` | `/api/v1/resumes/tailor` | No | Submit resume data + JD in body, get filtered bullet points and skills back |

### Database Schema (Prisma, SQLite)

```prisma
model User {
  id        String   @id @default(uuid())
  email     String   @unique
  password  String   // hashed
  createdAt DateTime @default(now())
  resumes   Resume[]
}

model Resume {
  id        String          @id @default(uuid())
  userId    String
  user      User            @relation(fields: [userId], references: [id], onDelete: Cascade)
  layout    String          @default("standard") // "standard" | "2:1-column"
  name      String?         // optional user-given label
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt
  sections  ResumeSection[]
}

model Section {
  id    String @id // "name_contact", "summary", "experience", "education", "hard_skills", "soft_skills", "certifications", "projects", "languages", "hobbies"
  label String // "Name & Contact", "Summary", "Experience", "Education", "Hard Skills", "Soft Skills", "Certifications", "Projects", "Languages", "Hobbies"
  sections ResumeSection[]
}

model ResumeSection {
  id        String         @id @default(uuid())
  resumeId  String
  resume    Resume         @relation(fields: [resumeId], references: [id], onDelete: Cascade)
  sectionId String
  section   Section        @relation(fields: [sectionId], references: [id])
  column    String         @default("right") // "left" | "right" for 2:1 layout
  order     Int            @default(0)
  entries   SectionEntry[]

  @@unique([resumeId, sectionId])
}

model SectionEntry {
  id              String         @id @default(uuid())
  resumeSectionId String
  resumeSection   ResumeSection  @relation(fields: [resumeSectionId], references: [id], onDelete: Cascade)
  order           Int            @default(0)
  fields          SectionField[]
  children        SectionEntry[] @relation("EntryChildren") // bullet points, sub-items
  parentId        String?
  parent          SectionEntry?  @relation("EntryChildren", fields: [parentId], references: [id])
}

model SectionField {
  id             String       @id @default(uuid())
  sectionEntryId String
  sectionEntry   SectionEntry @relation(fields: [sectionEntryId], references: [id], onDelete: Cascade)
  key            String       // e.g. "full_name", "email", "company", "title", "school", "degree", "skill_name", "bullet_text"
  value          String       // AES-256-GCM encrypted PII
  order          Int          @default(0)
}
```

**How the schema maps to each section type:**

| Section | Entries | Fields per entry | Children |
|---------|---------|------------------|----------|
| `name_contact` | 1 entry | `full_name`, `email`, `phone`, `location`, `linkedin_url`, `website` | none |
| `summary` | 1 entry | `text` | none |
| `experience` | 1 entry per job | `company`, `title`, `start_date`, `end_date`, `location` | bullet points (each a child entry with key=`bullet_text`) |
| `education` | 1 entry per school | `school`, `degree`, `field_of_study`, `start_date`, `end_date` | none |
| `hard_skills` | 1 entry | — | 1 child per skill (key=`skill_name`) |
| `soft_skills` | 1 entry | — | 1 child per skill (key=`skill_name`) |
| `certifications` | 1 entry per cert | `name`, `issuer`, `date` | none |
| `projects` | 1 entry per project | `name`, `description`, `url`, `start_date`, `end_date` | bullet points (each a child entry with key=`bullet_text`) |
| `languages` | 1 entry | — | 1 child per language (key=`language_name`, plus field `proficiency`) |
| `hobbies` | 1 entry | — | 1 child per hobby (key=`hobby_name`) |

### API Versioning

All endpoints are prefixed with `/api/v1/`. The NestJS app applies a global prefix in `main.ts`:

```ts
app.setGlobalPrefix('api/v1');
```

Future breaking changes increment the version (`/api/v2/...`). Old versions can coexist via versioned controllers.

### PII Encryption

Each `SectionField.value` is individually encrypted at rest using **AES-256-GCM**.

- `ENCRYPTION_KEY` — 32-byte hex-encoded key, loaded from env at startup.
- A `CryptoService` (NestJS singleton) provides `encrypt(plaintext: string): string` and `decrypt(ciphertext: string): string`.
- Encryption/decryption happens at the repository layer on every field read/write.
- Each encryption call generates a fresh random IV, prepended to the ciphertext for storage.
- Keys (field names) are stored in plaintext; only values are encrypted.
- Future upgrade path: swap to a KMS (AWS KMS, HashiCorp Vault) by replacing `CryptoService` internals.

```env
# .env
MATCHING_ENGINE=keyword   # keyword | llm | hybrid
LLM_API_KEY=              # only required for llm/hybrid
LLM_MODEL=gpt-4o-mini     # only required for llm/hybrid
BULLET_CAP=5              # max bullet points per experience after JD filtering
ENCRYPTION_KEY=           # 32-byte hex-encoded AES-256 key for PII encryption at rest
```

| Mode | Behavior |
|------|----------|
| `keyword` | TF-IDF or simple token overlap scoring. No external API. Fast, free, offline. |
| `llm` | Sends content + JD to LLM, asks it to rank and return top N items. Best quality. |
| `hybrid` | Keyword pre-filter to top K candidates, then LLM re-ranks. Balanced cost/quality. |

### Frontend Routes

| Route | Component | Auth |
|-------|-----------|------|
| `/builder` | ResumeBuilder (editor + preview) | Optional |
| `/login` | LoginForm | No |
| `/signup` | SignupForm | No |

### Local-First Data Flow

**Anonymous user:**
1. All resume data (layout, sections, entries, fields) lives in `localStorage` under a single key.
2. The frontend operates entirely offline. The `/tailor` endpoint is the only backend call — it receives resume data + JD in the request body and returns filtered results.
3. A banner shows: *"You're not signed in. Your resume is saved only in this browser. Sign up to save it permanently."*

**Sign up / Log in from anonymous state:**
1. User clicks "Sign Up" or "Log In" from the builder.
2. On successful auth, the frontend calls `POST /api/v1/resumes` with the full resume payload from `localStorage`.
3. Backend creates the `Resume` + all `ResumeSection` + `SectionEntry` + `SectionField` rows, encrypting field values.
4. Frontend clears `localStorage` and switches to authenticated mode — all subsequent saves go via `PUT /api/v1/resumes/:id`.

**Already authenticated user:**
1. On page load, `GET /api/v1/auth/me` confirms the session.
2. `GET /api/v1/resumes` fetches the user's resume list.
3. `GET /api/v1/resumes/:id` loads the full resume tree with decrypted fields.
4. Edits are saved via `PUT /api/v1/resumes/:id`.

## Dependencies

- Authentication module (included in this milestone).
- `jsPDF` + `html2canvas` (frontend, for PDF export).
- Optional: LLM API key if `llm` or `hybrid` matching modes are used.

## Open Questions

All resolved for prototype phase. Each decision includes an upgrade path.

- [x] **PDF generation:** Client-side via `jsPDF` + `html2canvas`. Simplest, no server dependency. If quality proves insufficient, swap to server-side Puppeteer later.
- [x] **Multiple resumes per account:** One resume per user in this milestone. The `Resume` table uses a `userId` foreign key (not one-to-one), so adding `/api/resumes` list + multi-resume support is a non-breaking addition.
- [x] **Name/Contact fields:** Full name, email, phone, location, LinkedIn URL, personal website. All optional except name.
- [x] **2:1 column layout:** Narrow (1/3) column on the left, wide (2/3) on the right. User assigns each section to a column in the section toggle UI.
- [x] **Bullet point cap:** Default 5 per experience entry, configurable via `BULLET_CAP` env var. LLM/hybrid modes pass it as a parameter; keyword mode simply takes the top-N.
