# Product data model

The database preserves the complete path from a submitted project to approved
social publications.

## Core records

- `User` — the owner of the personal workspace.
- `Project` — a repository and running product submitted for launch creation.
- `GenerationRun` — one attempt to understand, record, and prepare a project.
- `MediaAsset` — a video, thumbnail, captions file, evidence screenshot, or
  execution report produced by a run.
- `SocialDraft` — the English-only X or LinkedIn post prepared for review.
- `SocialAccount` — the public identity and connection state for a platform.

## Lifecycle

```text
Project
  └─ GenerationRun
       ├─ MediaAsset[]
       └─ SocialDraft[X, LINKEDIN]
```

Each run can have at most one draft per platform. Draft approval and publication
are separate states, so approving LinkedIn never implicitly approves X.

## Security boundary

The initial schema intentionally stores no OAuth access token, refresh token, or
client secret. `SocialAccount` records identity and connection status only.
Encrypted OAuth credentials will be introduced with the platform connection
milestone and will never be returned to browser components.

## Language rule

`Project.contentLanguage` and `SocialDraft.language` default to `en`. The web
interface and generated social content are English-only.
