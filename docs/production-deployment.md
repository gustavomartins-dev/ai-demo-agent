# Production deployment readiness

## Architecture

Deploy the same commit as two processes:

```text
Internet -> HTTPS/domain -> Next.js web
                              |      \
                              |       -> durable artifact volume (read)
                              v
                         PostgreSQL
                              ^
                              |
                    generation worker -> durable artifact volume (write)
                         |         |
                      Hermes   Chromium
```

The web process owns GitHub login, social OAuth callbacks, review, approval,
media delivery, and explicit publishing. The worker owns Hermes planning,
Playwright recording, and social draft generation. Both use one PostgreSQL
database and the same `AI_DEMO_OUTPUT_ROOT`; the volume must survive releases
and be mounted at the same absolute path.

## Pre-deploy validation

Set production secrets in the hosting secret manager, then run:

```bash
NODE_ENV=production npm run validate:production
npm run db:deploy
```

The validator fails closed unless PostgreSQL, Auth.js/GitHub, the owner
allowlist, HTTPS base URL, token encryption, X, LinkedIn, API version, Hermes,
and an absolute artifact path are configured. It validates shape, not network
access or provider approval.

Configure provider callbacks from `APP_BASE_URL` exactly:

```text
/api/auth/callback/github
/api/social/oauth/x/callback
/api/social/oauth/linkedin/callback
```

## Health and deployment order

- `GET /api/health/live` confirms the web process can answer requests.
- `GET /api/health/ready` returns 200 only when PostgreSQL responds and the
  artifact volume is readable/writable; otherwise it returns 503 without
  leaking dependency details.

Apply migrations first, deploy the web process, verify readiness, then deploy
the worker. During rollback, keep migrations and data; roll application code
back only to a version compatible with the current schema.

## Backups, retention, and restore

- PostgreSQL: encrypted daily backups plus point-in-time recovery; retain 30
  days initially. Test a restore into an isolated database monthly.
- Artifact volume: daily incremental snapshot, 30-day retention, and checksum
  verification. Database and volume backups should share a recovery timestamp.
- OAuth tokens: database backups contain ciphertext, but the encryption key is
  required for recovery. Back up that key separately in the secret manager.
- Restore drill: restore PostgreSQL and artifacts, mount the volume read-only,
  confirm media IDs resolve, then enable worker writes and provider actions.

Do not delete `PublishAttempt` records during retention cleanup. They are the
duplicate-publication and incident audit trail.

## Logs, metrics, and alerts

Collect JSON worker logs and HTTP platform logs without request bodies,
authorization headers, codes, or tokens. Track:

- queue depth and oldest queued run age;
- success/failure duration by generation state;
- lease loss and retry counts;
- media 404/416/5xx rates;
- OAuth callback outcomes by sanitized code;
- `PublishAttempt` counts by `SUCCEEDED`, `FAILED`, and `UNKNOWN`;
- provider latency, `401/403`, `429`, and `5xx` counts;
- PostgreSQL connections/storage and artifact volume capacity.

Alert immediately on `UNKNOWN` publishing outcomes, repeated lease loss,
readiness failure, backup failure, encryption-key mismatch, and unexpected
publishing volume. Alert before the artifact volume reaches 80% capacity.

## Production launch checklist

1. CI is green on the exact deployment commit.
2. `validate:production` and `db:deploy` succeed in the target environment.
3. HTTPS, secure cookies, GitHub owner login, and all three callbacks work.
4. PostgreSQL and artifact backup/restore drills have evidence.
5. Web and worker share the durable volume and media range requests work.
6. Hermes/provider model and cost limits are pinned.
7. X and LinkedIn show the correct owner identity and required scopes.
8. Run one controlled private/test project through video and draft review.
9. Publish one controlled post per platform, verify URLs, then delete the test
   posts manually if appropriate.
10. Confirm double-click protection, disconnect/reconnect, alerts, dashboards,
    and the incident owner before enabling normal use.

## Known production boundary

The current artifact backend is a shared filesystem. This suits one web host
and worker with a durable volume. Horizontal web scaling requires shared object
storage or a network filesystem while preserving owner authorization by asset
ID. Do not expose the bucket/volume publicly.
