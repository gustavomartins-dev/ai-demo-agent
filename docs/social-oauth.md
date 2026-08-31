# X and LinkedIn OAuth foundation

## Product outcome

The workspace can connect the owner's own X and LinkedIn identities without
sharing passwords or exposing provider tokens to the browser. This foundation
does not publish content. Callback routes and account controls are delivered in
the next issue.

## Official flows and permissions

X uses OAuth 2.0 Authorization Code with PKCE. The application requests
`tweet.read`, `tweet.write`, `users.read`, and `offline.access`; the last scope
provides a refresh token. See the official
[X PKCE guide](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code).

LinkedIn uses 3-legged member OAuth with `openid`, `profile`, and
`w_member_social`. The **Share on LinkedIn** product must be enabled for the
LinkedIn developer application before that posting scope is available. See
[Getting Access](https://learn.microsoft.com/en-us/linkedin/shared/authentication/getting-access)
and the official
[Authorization Code flow](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow).

Programmatic LinkedIn refresh tokens are restricted to approved partner
programs. The callback implementation must tolerate a response without a
refresh token and send the owner through authorization again when required.

## Provider application setup

Register these exact callback URLs in the provider consoles:

```text
https://YOUR_APP/api/social/oauth/x/callback
https://YOUR_APP/api/social/oauth/linkedin/callback
```

For local development, replace `https://YOUR_APP` with `http://localhost:3000`
only when the provider permits it. `APP_BASE_URL` must match the registered
origin exactly.

Configure:

```bash
APP_BASE_URL="http://localhost:3000"
X_CLIENT_ID="..."
X_CLIENT_SECRET="..." # only when the X app is configured as confidential
LINKEDIN_CLIENT_ID="..."
LINKEDIN_CLIENT_SECRET="..."
SOCIAL_TOKEN_ENCRYPTION_KEY="..."
SOCIAL_TOKEN_ENCRYPTION_KEY_ID="v1"
```

Generate the encryption key once and store it only in the deployment secret
manager:

```bash
openssl rand -base64 32
```

Never commit provider credentials, OAuth tokens, or the encryption key.

## Security model

- `state` — random callback correlation used to reject OAuth CSRF. Only its
  SHA-256 hash is stored and an attempt expires after ten minutes.
- PKCE — X receives an S256 challenge while the verifier is encrypted in
  PostgreSQL until the callback consumes it once.
- `SocialCredential` — tokens are encrypted with AES-256-GCM, which provides
  confidentiality and tamper detection.
- `SocialAccount` — safe display metadata only. Browser-facing queries never
  select encrypted credential columns.
- Client secrets — server environment only; never sent in authorization URLs
  or client components.

## Key rotation boundary

Every encrypted record stores `encryptionKeyId`, but the current runtime loads
one active key. Before changing the key, implement a controlled re-encryption
job or disconnect/reconnect both accounts, verify no records remain under the
old key ID, then deploy the new key. Replacing the environment key first makes
existing tokens and in-flight PKCE attempts unreadable.

If the key is exposed, disable publishing, rotate/revoke provider tokens,
remove affected credentials, configure a new encryption key ID, and reconnect
the accounts. Do not log decrypted values during recovery.

## Current boundary

The schemas, encryption, provider configuration, PKCE generation, and one-time
attempt storage are ready. Issue #32 will add owner-only start/callback routes,
token exchange, external identity verification, reconnect, and disconnect.
