# Workspace authentication runbook

## Product outcome

AI Demo Agent is a private, single-owner workspace. GitHub proves the owner's
identity, Auth.js manages the browser session, and Prisma persists that session
in PostgreSQL. Dashboard reads and project mutations use the authenticated
`User.id`; knowing a project URL is not enough to access it.

```text
Browser ──► /login ──► GitHub OAuth
                           │
                           ▼
                    Auth.js callback
                           │
                  owner login allowlist
                           │
                           ▼
                 PostgreSQL session ──► private workspace
```

The GitHub integration is only for workspace login. X and LinkedIn publishing
will use separate OAuth connections and separate credentials.

## Local GitHub OAuth App

Create an OAuth App in **GitHub → Settings → Developer settings → OAuth Apps**.
Use:

- **Application name:** `AI Demo Agent Local`
- **Homepage URL:** `http://localhost:3000`
- **Authorization callback URL:**
  `http://localhost:3000/api/auth/callback/github`

Copy `apps/web/.env.example` to `apps/web/.env`, then configure:

```dotenv
DATABASE_URL="postgresql://ai_demo_agent:ai_demo_agent@localhost:5432/ai_demo_agent?schema=public"
AUTH_SECRET="a-random-authjs-secret"
AUTH_GITHUB_ID="the-oauth-app-client-id"
AUTH_GITHUB_SECRET="the-oauth-app-client-secret"
APP_OWNER_GITHUB_LOGIN="your-exact-github-login"
```

Generate `AUTH_SECRET` from the web workspace instead of inventing one:

```bash
cd apps/web
npx auth secret
cd ../..
```

Keep `apps/web/.env` out of Git. Never paste the GitHub client secret into an
issue, commit, screenshot, browser variable, or CI log.

## Start and verify locally

```bash
npm install
docker compose up -d postgres
npm run db:deploy
npm run dev:web
```

Open `http://localhost:3000`. Expected behavior:

1. `/` redirects to `/login` without a valid session.
2. **Continue with GitHub** returns to the dashboard for the configured owner.
3. A different GitHub login reaches the English access-denied page.
4. The dashboard shows the active name/email and **Sign out** returns to login.
5. A project created after login belongs to the authenticated database user.

Use a private/incognito browser window to test the unauthorized-account path
without disturbing the owner's main GitHub session.

## Production deployment

Register a production callback using the deployed HTTPS origin:

```text
https://your-domain.example/api/auth/callback/github
```

Set `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, and
`APP_OWNER_GITHUB_LOGIN` in the hosting platform's encrypted environment
settings. Apply migrations with `npm run db:deploy` during deployment, then
verify the five behaviors above against the production URL.

Use a separate OAuth App for local and production environments. This isolates
credentials and lets either environment be rotated without interrupting the
other.

## Failure modes and recovery

| Symptom | Likely cause | Recovery |
| --- | --- | --- |
| `Configuration` error | Missing/invalid Auth.js environment variable | Verify all five production variables and redeploy |
| GitHub callback error | OAuth App callback does not match the current origin | Set the exact `/api/auth/callback/github` URL |
| Access denied for the owner | `APP_OWNER_GITHUB_LOGIN` does not match the GitHub login | Correct the login; matching is case-insensitive |
| Session/database error | Auth migration is missing or PostgreSQL is unavailable | Restore database access and run `npm run db:deploy` |
| Old sessions fail after secret rotation | `AUTH_SECRET` changed | Expected: sign in again with GitHub |

If `AUTH_GITHUB_SECRET` is exposed, generate a new client secret in GitHub,
update the encrypted deployment variable, redeploy, verify login, and delete
the old secret. If `AUTH_SECRET` is exposed, replace it with a newly generated
value; this invalidates existing sessions and requires a fresh login.

## Security boundaries

- The owner allowlist fails closed when `APP_OWNER_GITHUB_LOGIN` is absent.
- Route checks improve navigation, but every Server Action rechecks the session.
- Data-access queries scope records with authenticated `ownerId`.
- Callback targets accept only local paths, preventing open redirects.
- GitHub OAuth account tokens and sessions live in server-side PostgreSQL tables.
- X and LinkedIn credentials do not belong in `SocialAccount`; their encrypted
  storage design is a separate integration milestone.
