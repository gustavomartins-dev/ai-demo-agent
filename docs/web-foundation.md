# Web application foundation

## Product outcome

AI Demo Agent now has a persistent personal workspace around the verified
Hermes and Playwright engine. A project can be described once and retained with
its processing attempts, media, evidence, and separate X and LinkedIn drafts.

```text
Next.js dashboard
      │
      ▼
Server Actions ──► Zod validation
      │
      ▼
Server-only Data Access Layer
      │
      ▼
Prisma ORM ──► PostgreSQL

Project ──► GenerationRun ──► MediaAsset
                         └──► SocialDraft[X, LINKEDIN]
```

The automation engine remains in the root `src/` directory. The Next.js
application lives in `apps/web`, so the proven CLI and browser runner remain
usable while the product interface evolves.

## Local setup

Requirements:

- Node.js 22
- Docker with Compose
- Playwright Chromium

```bash
npm install
npx playwright install chromium
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres
npm run db:migrate
npm run dev:web
```

Open `http://localhost:3000`.

## Current user journey

1. Open the launch dashboard.
2. Add a project name, product URL, optional repository, and launch objective.
3. The server validates the request and creates `Project` plus its first queued
   `GenerationRun` in one transaction.
4. Open the project detail page to see run history.
5. Media, evidence, X drafts, and LinkedIn drafts appear under their run as the
   processing pipeline writes those records.

The background worker that connects a queued run to Hermes and Playwright is
the next processing milestone. The current foundation deliberately separates
persistence and review UI from worker execution.

## Security boundaries

- Prisma and environment variables are confined to server-only modules.
- Browser components receive minimal DTOs rather than database records.
- Server Action inputs are untrusted and validated with Zod.
- Project details are scoped to the configured personal workspace owner.
- No access token, refresh token, or OAuth client secret exists in the schema.
- Production project creation is blocked until workspace authentication is
  implemented.
- X and LinkedIn approvals remain independent.
- Generated social content defaults to English.

## Validation

GitHub Actions runs Prisma validation, engine tests, both TypeScript checks,
ESLint, the Next.js production build, Playwright browser tests, and a production
dependency audit on every pull request and push to `main`.

CI uses a syntactically valid placeholder `DATABASE_URL`; it does not connect to
a database because the current quality suite validates schema, migrations,
data contracts, compilation, and browser execution without persistent fixtures.

## Next milestone

The next foundation is workspace authentication followed by LinkedIn and X
OAuth. Only after authenticated account ownership is established will
production mutations and encrypted social credentials be enabled.
