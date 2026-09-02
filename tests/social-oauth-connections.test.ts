import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { effectiveSocialAccountStatus } from "../apps/web/src/lib/social-oauth/account-status.js";
import { loadSocialOAuthConfig } from "../apps/web/src/lib/social-oauth/config.js";
import { exchangeSocialAuthorizationCode, fetchSocialIdentity, refreshSocialAccessToken, SocialProviderError } from "../apps/web/src/lib/social-oauth/provider-client.js";

describe("social provider callbacks", () => {
  it("exchanges an X code with PKCE and verifies the account identity", async () => {
    const config = loadSocialOAuthConfig("X", { APP_BASE_URL: "https://app.example", X_CLIENT_ID: "x-client" });
    const tokenFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access-secret",
      refresh_token: "refresh-secret",
      expires_in: 7200,
      scope: "tweet.read tweet.write users.read offline.access",
    }), { status: 200 }));
    const token = await exchangeSocialAuthorizationCode(config, "code", "verifier", tokenFetch);
    const request = tokenFetch.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain("code_verifier=verifier");
    expect(String(request.body)).toContain("client_id=x-client");
    expect(token.refreshToken).toBe("refresh-secret");

    const identity = await fetchSocialIdentity("X", token.accessToken, vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "x-123", name: "Gustavo", username: "gustavo" } }), { status: 200 }),
    ));
    expect(identity).toEqual({ externalAccountId: "x-123", displayName: "Gustavo", handle: "@gustavo" });
  });

  it("uses LinkedIn userinfo to verify the member identity", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: "li-123", name: "Gustavo Martins" }), { status: 200 }));
    await expect(fetchSocialIdentity("LINKEDIN", "secret", fetcher)).resolves.toEqual({
      externalAccountId: "li-123",
      displayName: "Gustavo Martins",
      handle: null,
    });
    expect(fetcher).toHaveBeenCalledWith("https://api.linkedin.com/v2/userinfo", expect.objectContaining({ headers: { Authorization: "Bearer secret" } }));
  });

  it("rotates an expired X access token with the stored refresh token", async () => {
    const config = loadSocialOAuthConfig("X", {
      APP_BASE_URL: "https://app.example",
      X_CLIENT_ID: "x-client",
      X_CLIENT_SECRET: "x-secret",
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "new-access",
      refresh_token: "new-refresh",
      expires_in: 7200,
      scope: "tweet.read tweet.write users.read offline.access",
    }), { status: 200 }));
    const token = await refreshSocialAccessToken(config, "old-refresh", fetcher);
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(String(request.body)).toContain("grant_type=refresh_token");
    expect(String(request.body)).toContain("refresh_token=old-refresh");
    expect(request.headers).toMatchObject({ Authorization: expect.stringMatching(/^Basic /) });
    expect(token).toMatchObject({ accessToken: "new-access", refreshToken: "new-refresh", expiresIn: 7200 });
  });

  it("returns sanitized provider failures without response bodies or tokens", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_token", detail: "access_token=leaked" }), { status: 401 }));
    const failure = fetchSocialIdentity("X", "secret-token", fetcher);
    await expect(failure).rejects.toMatchObject<Partial<SocialProviderError>>({ operation: "identity_lookup", status: 401, providerCode: "invalid_token" });
    const secondFailure = fetchSocialIdentity("X", "secret-token", fetcher);
    await expect(secondFailure).rejects.not.toThrow(/leaked|secret-token/);
  });
});

describe("connection lifecycle", () => {
  it("shows an expired state when authorization time has passed", () => {
    const now = new Date("2026-08-31T12:00:00.000Z");
    expect(effectiveSocialAccountStatus("CONNECTED", new Date("2026-08-31T11:00:00.000Z"), now)).toBe("EXPIRED");
    expect(effectiveSocialAccountStatus("CONNECTED", new Date("2026-08-31T13:00:00.000Z"), now)).toBe("CONNECTED");
  });

  it("keeps start, callback, and disconnect operations owner-authenticated", async () => {
    const start = await readFile(new URL("../apps/web/src/app/api/social/oauth/[platform]/route.ts", import.meta.url), "utf8");
    const callback = await readFile(new URL("../apps/web/src/app/api/social/oauth/[platform]/callback/route.ts", import.meta.url), "utf8");
    const actions = await readFile(new URL("../apps/web/src/app/actions.ts", import.meta.url), "utf8");
    const data = await readFile(new URL("../apps/web/src/data/social-accounts.ts", import.meta.url), "utf8");
    expect(start).toContain("const session = await auth()");
    expect(callback).toContain("consumeSocialOAuthAttempt(session.user.id");
    expect(callback.indexOf("consumeSocialOAuthAttempt")).toBeLessThan(callback.indexOf('query.has("error")'));
    expect(actions).toContain("disconnectOwnedSocialAccount(session.user.id");
    expect(data).toContain("transaction.socialCredential.deleteMany");
    expect(data).toContain("where: { id: account.id, userId, platform }");
  });
});
