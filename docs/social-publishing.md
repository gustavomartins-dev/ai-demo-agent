# Safe social publishing runbook

## Product outcome

The owner can approve and publish X and LinkedIn independently. Approval never
publishes. The external request occurs only after a second explicit
**Publish approved post** action and always sends the immutable approved
snapshot rather than mutable editor state.

## Safety and idempotency

Approval stores `approvedContent`, its SHA-256 `approvedContentHash`, the owner
ID, and timestamp. Editing clears all approval fields. Approval is blocked
without verified evidence and a connected, unexpired account for the same
platform.

Before an external request, PostgreSQL atomically changes the draft from
`APPROVED` to `PUBLISHING` and creates a `PublishAttempt`. The unique
`(socialDraftId, approvalHash)` constraint prevents double clicks, worker
retries, or repeated form submissions from creating a second provider request
for the exact approval.

An uncertain network/server outcome becomes `UNKNOWN`. The application does
not retry it automatically because the provider may have created the post
before the response was lost. Reconcile the real account manually. Never delete
an `UNKNOWN` attempt merely to retry; that can create a duplicate.

## Provider requests

- X: `POST https://api.x.com/2/tweets` with the exact approved text and the
  account's OAuth 2.0 user access token. See the official
  [Create Posts API](https://docs.x.com/x-api/posts/create-post).
- LinkedIn: `POST https://api.linkedin.com/rest/posts` with the verified member
  URN, public visibility, main-feed distribution, `Linkedin-Version`, and
  Rest.li protocol headers.

Set `LINKEDIN_API_VERSION` to a six-digit version currently supported by the
LinkedIn application. Treat version changes as releases and run the safety gate
before deployment.

Expired access is blocked before an external request. Reconnect X to obtain a
new PKCE authorization and refresh token. Reconnect LinkedIn through 3-legged
OAuth; programmatic refresh is available only to approved partner programs.

## Automated release gate

Run:

```bash
npm run test:social-safety
```

The dedicated CI gate covers token encryption/tampering, OAuth state and PKCE,
provider denial boundaries, identity lookup, owner-scoped disconnect, immutable
approval, double-submit prevention, successful X/LinkedIn requests, rate
limits, timeouts, server errors, and incomplete/ambiguous success responses.
No test calls a real provider.

## Manual sandbox checklist

Complete this checklist with test posts before allowing production use:

1. Confirm both provider applications show the exact production callback URLs.
2. Confirm X grants `tweet.read tweet.write users.read offline.access`.
3. Confirm LinkedIn grants `openid profile w_member_social` and the Share on
   LinkedIn product is active.
4. Connect each owner account and compare the displayed identity with the
   provider account.
5. Generate a test project, save edits, and approve X only. Confirm LinkedIn
   remains `DRAFT`.
6. Publish X once, double-click during the request, and confirm one external
   post and one `PublishAttempt`.
7. Approve and publish LinkedIn; confirm the stored provider ID and URL open the
   expected member post.
8. Disconnect each account and confirm encrypted `SocialCredential` rows are
   removed.
9. Revoke access in each provider's connected-app settings and confirm the app
   gives a reconnect path rather than exposing provider error bodies.

## Failure and incident response

| State/code | Meaning | Safe response |
| --- | --- | --- |
| `http_401` / `http_403` | Token revoked, expired, or missing scope | Disconnect and reconnect; verify provider product access |
| `http_429` | Provider rate limit | Do not bypass the attempt record; approve a new snapshot only after the limit clears and external account is checked |
| `http_5xx` | Provider response may be ambiguous | Inspect the external account before any new approval |
| `network_or_timeout` | Request outcome is unknown | Treat as possibly published and reconcile manually |
| `missing_restli_id` / `invalid_success_response` | Provider reported success without usable identity | Treat as possibly published and reconcile manually |
| `linkedin_version_missing` | Deployment configuration is incomplete | Set a supported version; no request was sent |

If tokens or the encryption key leak: disable the application, revoke both
provider authorizations, delete local credentials, rotate the encryption key
and key ID, reconnect, and review `PublishAttempt` plus provider histories.
Application errors and logs contain stable error codes only—never response
bodies, access tokens, refresh tokens, authorization codes, or client secrets.

## Cost and rate limits

X access and posting charges depend on the current developer plan; LinkedIn
availability depends on approved products. Track requests and provider billing
outside the application for now. Alert on unexpected `PublishAttempt` volume
and `http_429`; one completed launch should create at most one successful
attempt per platform and approval hash.

## Rollback

To stop outbound publishing without losing reviews, remove/disable the provider
client credentials or deployment access to the publishing routes, then deploy
the previous application revision. Do not roll back database migrations after
attempts exist. Preserve `PublishAttempt` records for reconciliation and keep
the UI read-only until provider/account history matches PostgreSQL.
