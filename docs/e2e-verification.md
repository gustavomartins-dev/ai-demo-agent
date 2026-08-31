# End-to-end launch verification

## Objective

The Playwright end-to-end check proves that an authenticated owner can review generated media, edit and approve an X draft, and inspect an already-published LinkedIn result from the same project workspace.

This is the release-level journey. Unit and integration tests continue to run in Vitest; Playwright owns browser behavior only.

## What the harness verifies

- Authentication through a real database-backed Auth.js session.
- Owner-only access to the project review workspace.
- Secure video delivery, including HTTP byte-range responses used by browsers.
- Editing and saving an English X draft.
- Explicit approval without accidental publication.
- Publishing remains available only after approval and connection checks pass.
- A published LinkedIn draft exposes its provider result URL.

The fixture never calls X or LinkedIn. Real provider publishing remains covered by the provider contract and safety tests so CI cannot create public posts.

## Run locally

Use a disposable PostgreSQL database with all migrations applied, then run:

```bash
npm run db:deploy
npm run test:e2e
```

`scripts/seed-e2e.ts` replaces only the deterministic `e2e-owner` fixture and writes fake media under `/tmp/ai-demo-agent-e2e-output`. Do not point `DATABASE_URL` at production.

## Continuous integration

The `Quality` workflow starts a clean PostgreSQL service, applies migrations, builds the web application, and then runs `npm run test:e2e`. A failure blocks the production-readiness milestone because it means the complete owner review path is no longer demonstrably usable.
