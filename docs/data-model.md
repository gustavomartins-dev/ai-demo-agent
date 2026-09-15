# Product data model

The database preserves the complete path from a submitted project to approved
social publications.

## Core records

- `User` — the owner of the personal workspace.
- `Project` — a repository and running product submitted for launch creation.
- `GenerationRun` — one attempt to understand, record, and prepare a project.
- `GenerationRun.repositorySnapshot` — a bounded, commit-pinned copy of the source files used to ground generated technical claims.
- `MediaAsset` — a video, thumbnail, captions file, evidence screenshot, or
  execution report produced by a run.
- `SocialDraft` — the English-only X or LinkedIn post prepared for review.
- `SocialAccount` — the public identity and connection state for a platform.
- `SocialCredential` — encrypted OAuth access/refresh tokens, isolated from
  account metadata returned to the web interface.
- `SocialOAuthAttempt` — short-lived hashed OAuth state and encrypted X PKCE
  verifier used once during a callback.
- `PublishAttempt` — one durable, idempotent external request for an exact
  approved content hash, including sanitized outcome and provider identity.
- `LaunchPackage` — the editable README, repository description, release tag,
  release notes, provenance, immutable approval, and final GitHub identities.
- `GitHubPublishAttempt` — the idempotency and incident record for one approved
  GitHub package hash.

## Lifecycle

```text
Project
  └─ GenerationRun
       ├─ MediaAsset[]
       ├─ SocialDraft[X, LINKEDIN]
       │    └─ PublishAttempt[]
       └─ LaunchPackage
            └─ GitHubPublishAttempt[]
```

Each run can have at most one draft per platform and one GitHub launch package.
All three approval and publication paths are independent; completing one never
implicitly authorizes either of the others.

## Security boundary

`SocialAccount` records safe identity, scopes, status, and expiry metadata only.
`SocialCredential` stores AES-256-GCM encrypted access and refresh tokens in a
one-to-one record. Client secrets remain environment variables and no account
read includes credential fields. `SocialOAuthAttempt.stateHash` prevents raw
OAuth state from being stored; X's PKCE verifier is encrypted until one-time
callback consumption.

## Language rule

`Project.contentLanguage` and `SocialDraft.language` default to `en`. The web
interface and generated social content are English-only.
