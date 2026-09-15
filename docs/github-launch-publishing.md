# GitHub launch publishing

## Product outcome

After a verified web recording, the review page contains one editable GitHub
package: repository description, `README.md`, semantic release tag, release
title, and release notes. Approval freezes that exact package. A second,
explicit action updates the repository and publishes a GitHub release with the
recorded MP4 and all stored evidence screenshots through the official GitHub
REST API.

The generation worker never publishes.

## Grounding and stale-source protection

The worker reads the configured `https://github.com/OWNER/REPOSITORY` through
the GitHub API. It records the default branch commit SHA and a bounded selection
of README, manifest, documentation, and source files. Environment files,
private-key formats, generated directories, lockfiles, source maps, and
minified JavaScript are excluded. Each file is capped at 16,000 characters,
with at most 24 files and 96,000 characters total.
Common token formats and quoted secret assignments are redacted before the
snapshot is stored or sent to Hermes; files containing private-key blocks are
discarded. This is defense in depth, not a substitute for secret scanning and
removing credentials from Git history.

Hermes receives this snapshot through the provider-agnostic `AiProvider`
contract. Technical statements must cite snapshot paths; observed behavior must
cite passed Playwright evidence. Before publication, the API verifies that the
default branch, repository description, branch SHA, and existing README blob
SHA still match the approved source. If any changed, publication stops with
`source_changed` before any write.
Regenerate against the newer revision instead of overriding concurrent work.

## Credentials and permissions

Production validation requires `GITHUB_LAUNCH_TOKEN` as a fine-grained personal access token restricted
to the exact repository. It needs:

- **Contents: read and write** to read source and update `README.md`, create the
  release tag, and upload release assets;
- **Administration: read and write** to update the repository description.

Store it only in the deployment secret manager. Local development can fall back
to the owner's Auth.js GitHub access token only when its recorded OAuth scope
contains `repo`; normal sign-in tokens intentionally do not
request broad repository write access.

`GITHUB_API_VERSION` defaults to `2026-03-10`. Treat changes as dependency
upgrades and run the launch safety test before deployment.

## Approval and idempotency

Editing clears approval. Approval stores the structured snapshot, SHA-256 hash,
owner, and time, but performs no external request. Publication atomically
creates one `GitHubPublishAttempt` for `(launchPackageId, approvalHash)` and
moves the package to `PUBLISHING`. Repeated clicks cannot create a second
request for the same approval.

The provider sequence is:

1. verify the default branch and README revision;
2. update `README.md` with the current blob SHA;
3. update the repository description;
4. create a draft release targeting the new README commit;
5. upload the verified MP4 and evidence image;
6. publish the draft release.

GitHub does not provide one transaction across those resources. A failure
after the first write can leave a partial launch. Such outcomes are marked
`UNKNOWN` and are never retried automatically. Inspect the repository, release,
and `GitHubPublishAttempt` before preparing a new approval.

## Verification

```bash
npm run check
npm run test:launch-safety
npm run db:validate
```

Tests use mocked HTTP responses; they do not call or modify a real repository.
Before production, use a disposable repository to verify token permissions,
source-change blocking, asset size, approval, double-click protection, and the
final release URL.
