# Generation worker runbook

## Product outcome

The web app queues a `GenerationRun`; a separate worker claims it, asks Hermes
for a validated plan, records that plan with Playwright, and uses the verified
browser evidence to create separate English drafts for X and LinkedIn.

```text
Next.js ──► PostgreSQL queue ──► generation worker
                                      │
                         Hermes: validated plan
                                      │
                      Playwright: video + evidence
                                      │
                    Hermes: X + LinkedIn drafts
                                      │
                                      ▼
                              READY_FOR_REVIEW
```

The worker is separate from Next.js because planning and browser recording can
outlive an HTTP request. PostgreSQL leases prevent concurrent workers from
processing the same run and recover work after a crashed process.

## Local startup

Requirements:

- PostgreSQL with all migrations applied
- Hermes Agent installed and authenticated with its configured provider
- Playwright Chromium installed
- the same `DATABASE_URL` available to the web app and worker

```bash
cp apps/web/.env.example apps/web/.env
docker compose up -d postgres
npm install
npm run db:deploy
npx playwright install chromium
```

Run the services in separate terminals:

```bash
npm run dev:web
```

```bash
npm run worker
```

The worker loads `apps/web/.env` with `dotenv`. Environment variables supplied
by the operating system take precedence.

## Processing states

| State | Meaning |
| --- | --- |
| `QUEUED` | Waiting for an eligible worker or automatic retry time |
| `ANALYZING` | Worker claimed the run and is preparing project context |
| `PLANNING` | Hermes is generating the browser plan |
| `PLANNED` | Validated plan is persisted and waiting for recording |
| `RECORDING` | Playwright is executing and capturing evidence |
| `DRAFTING` | Hermes is writing validated X and LinkedIn drafts from browser evidence |
| `READY_FOR_REVIEW` | Video, evidence, and both drafts are persisted for owner review |
| `FAILED` | Automatic attempts are exhausted; owner can retry manually |

Planning failures return to `QUEUED`. Recording failures return to `PLANNED`,
so a valid Hermes plan is not regenerated unnecessarily. Drafting failures
return to `DRAFTING`, preserving the plan, video, and evidence. Retry delay
doubles after each failure. A manual retry resets the attempt budget and
preserves a valid persisted plan when one exists.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `AI_DEMO_WORKER_ID` | hostname and process ID | Identifies lease ownership in logs and PostgreSQL |
| `AI_DEMO_WORKER_POLL_MS` | `2000` | Delay between empty-queue checks |
| `AI_DEMO_WORKER_LEASE_MS` | `120000` | Time before another worker may recover abandoned work |
| `AI_DEMO_WORKER_HEARTBEAT_MS` | `30000` | Lease renewal interval; must be shorter than the lease |
| `AI_DEMO_OUTPUT_ROOT` | `../../output` locally | Persistent directory for video, JSON reports, and screenshots |
| `AI_DEMO_HERMES_COMMAND` | `hermes` | Local Hermes executable |
| `AI_DEMO_HERMES_TIMEOUT_MS` | `120000` | Maximum planning command duration |
| `OPENAI_API_KEY` | unset | Enables English OpenAI text-to-speech narration; captions remain available without it |
| `AI_DEMO_TTS_MODEL` | `gpt-4o-mini-tts` | OpenAI speech model used for portfolio narration |
| `AI_DEMO_TTS_VOICE` | `marin` | OpenAI voice used for narration |

`AI_DEMO_HERMES_MODEL` and `AI_DEMO_HERMES_PROVIDER` are optional. Leaving them
empty reuses the active Hermes configuration.

The Hermes login and `OPENAI_API_KEY` are separate credentials. Hermes plans and
operates the demo; the OpenAI Audio API creates the optional narration, which
is desktop-only today. Every presentation — web or desktop — includes a
step-synced English WebVTT caption track and an idle-trimmed H.264 MP4, so a
web demo remains understandable when X or LinkedIn starts playback muted, and
its file is one they actually accept.

## Logs and diagnosis

Every worker log line is JSON. Filter by `workerId`, `runId`, or `event`.
Important events include:

- `worker.started`, `worker.idle`, and `worker.stopped`
- `run.claimed` and `run.processed`
- `run.heartbeat_failed` and `run.lease_lost`
- `run.failed` with `retrying`, `failed`, or `lost-lease` outcome

Common recovery paths:

| Symptom | Action |
| --- | --- |
| Jobs remain `QUEUED` | Confirm `npm run worker` is active and uses the same `DATABASE_URL` |
| Hermes command fails | Run `hermes --version`, verify provider authentication, and inspect `run.failed` |
| Chromium executable is missing | Run `npx playwright install chromium` on the worker host |
| Repeated lease loss | Increase lease duration or restore PostgreSQL connectivity |
| Run reaches `FAILED` | Review its error/evidence, correct the cause, then use **Retry generation** |

## Storage and deployment

`MediaAsset.storageKey` is relative to `AI_DEMO_OUTPUT_ROOT`; it never depends on
the worker's absolute filesystem path. In production, mount that directory on a
persistent volume shared with whichever service will serve review downloads.
Object storage such as S3 or Cloudflare R2 can later replace the volume without
changing the generation lifecycle.

The owner review page accesses local artifacts through `/api/media/:assetId`.
The endpoint resolves ownership from PostgreSQL, accepts only `READY` assets,
contains storage keys within `AI_DEMO_OUTPUT_ROOT`, disables shared caching, and
supports byte ranges so browsers can seek through WebM video. The artifact
volume itself must never be mounted as a public static directory.

Deploy the web process and worker process from the same commit and apply
migrations before either starts. Only the worker needs Hermes and Chromium.
The web process needs access to PostgreSQL and, until object storage is added,
read access to the artifact volume.

## Graceful shutdown

Send `SIGTERM` for deployments or `Ctrl+C` locally. The worker stops claiming
new runs, aborts the active processor boundary, disconnects Prisma, and exits.
If the process is killed abruptly, its lease expires and another worker resumes
the run. Never edit `workerId` or lease timestamps manually.

## Current boundary

The worker creates drafts but never publishes them. Verified mention candidates
are not connected yet, so generated mention lists remain empty by default.
Editing, approval, account OAuth, and publishing stay behind later explicit
owner actions so generation cannot accidentally publish content.
