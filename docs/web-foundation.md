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

1. Sign in with the configured workspace owner's GitHub account.
2. Open the private launch dashboard.
3. Add a project name, product URL, optional repository, and launch objective.
4. The server validates the request and creates `Project` plus its first queued
   `GenerationRun` in one transaction.
5. Open the project detail page to see run history.
6. Media, evidence, X drafts, and LinkedIn drafts appear under their run as the
   processing pipeline writes those records.

The standalone generation worker now connects queued runs to Hermes and
Playwright. PostgreSQL leases keep processing outside web requests, while the
project page exposes lifecycle state, attempts, evidence, and manual recovery.

## Security boundaries

- Prisma and environment variables are confined to server-only modules.
- Browser components receive minimal DTOs rather than database records.
- Server Action inputs are untrusted and validated with Zod.
- GitHub OAuth is restricted by `APP_OWNER_GITHUB_LOGIN` and fails closed when
  the owner is not configured.
- Dashboard, project details, and Server Actions use the authenticated `User.id`.
- Auth.js sessions and GitHub account records are stored server-side in
  PostgreSQL; OAuth client secrets remain environment-only.
- Social publishing credentials are not stored in `SocialAccount` yet.
- X and LinkedIn approvals remain independent.
- Generated social content defaults to English.

## Validation

GitHub Actions runs Prisma validation, engine tests, both TypeScript checks,
ESLint, the Next.js production build, Playwright browser tests, and a production
dependency audit on every pull request and push to `main`.

CI starts PostgreSQL and applies every committed migration from an empty
database. It also uses non-production Auth.js placeholders for compilation; no
real OAuth credential is available to pull requests or builds.

## Next milestone

The next milestone generates distinct English X and LinkedIn drafts from the
verified demo, followed by platform OAuth and explicit approval before every
post.
