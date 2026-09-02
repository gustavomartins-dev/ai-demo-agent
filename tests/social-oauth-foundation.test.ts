import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { loadSocialOAuthConfig } from "../apps/web/src/lib/social-oauth/config.js";
import { decryptSecret, encryptSecret, loadTokenEncryptionConfig } from "../apps/web/src/lib/social-oauth/crypto.js";
import { createSocialOAuthStart, hashOAuthState, oauthStateMatches } from "../apps/web/src/lib/social-oauth/flow.js";

const baseEnvironment = { APP_BASE_URL: "https://app.example" };

describe("social OAuth provider configuration", () => {
  it("uses X Authorization Code with PKCE and minimum publishing scopes", () => {
    const config = loadSocialOAuthConfig("X", { ...baseEnvironment, X_CLIENT_ID: "x-client" });
    expect(config.authorizationEndpoint).toBe("https://x.com/i/oauth2/authorize");
    expect(config.tokenEndpoint).toBe("https://api.x.com/2/oauth2/token");
    expect(config.scopes).toEqual(["tweet.read", "tweet.write", "users.read", "offline.access"]);
    expect(config.usesPkce).toBe(true);
  });

  it("uses LinkedIn member authorization with share permission", () => {
    const config = loadSocialOAuthConfig("LINKEDIN", {
      ...baseEnvironment,
      LINKEDIN_CLIENT_ID: "linkedin-client",
      LINKEDIN_CLIENT_SECRET: "linkedin-secret",
    });
    expect(config.authorizationEndpoint).toBe("https://www.linkedin.com/oauth/v2/authorization");
    expect(config.scopes).toEqual(["openid", "profile", "w_member_social"]);
    expect(config.usesPkce).toBe(false);
  });
});

describe("OAuth transaction security", () => {
  it("creates unpredictable state and an S256 PKCE challenge for X", () => {
    const config = loadSocialOAuthConfig("X", { ...baseEnvironment, X_CLIENT_ID: "x-client" });
    const start = createSocialOAuthStart(config);
    const url = new URL(start.authorizationUrl);
    expect(start.state).not.toBe(start.stateHash);
    expect(start.codeVerifier?.length).toBeGreaterThanOrEqual(43);
    expect(url.searchParams.get("state")).toBe(start.state);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(start.codeVerifier);
  });

  it("rejects missing and tampered callback state", () => {
    const state = "trusted-random-state";
    const stored = hashOAuthState(state);
    expect(oauthStateMatches(state, stored)).toBe(true);
    expect(oauthStateMatches("tampered", stored)).toBe(false);
    expect(oauthStateMatches("", stored)).toBe(false);
  });
});

describe("social token encryption", () => {
  it("encrypts with authenticated AES-256-GCM and detects tampering", () => {
    const config = { key: randomBytes(32), keyId: "v1" };
    const encrypted = encryptSecret("secret-access-token", config);
    expect(encrypted).not.toContain("secret-access-token");
    expect(decryptSecret(encrypted, config)).toBe("secret-access-token");
    const parts = encrypted.split(".");
    parts[2] = `${parts[2]?.startsWith("A") ? "B" : "A"}${parts[2]?.slice(1)}`;
    expect(() => decryptSecret(parts.join("."), config)).toThrow();
  });

  it("requires an exact 32-byte base64 key", () => {
    expect(loadTokenEncryptionConfig({
      SOCIAL_TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      SOCIAL_TOKEN_ENCRYPTION_KEY_ID: "v1",
    }).key).toHaveLength(32);
    expect(() => loadTokenEncryptionConfig({
      SOCIAL_TOKEN_ENCRYPTION_KEY: randomBytes(16).toString("base64"),
      SOCIAL_TOKEN_ENCRYPTION_KEY_ID: "v1",
    })).toThrow(/32 bytes/);
  });

  it("keeps encrypted credential columns out of public account reads", async () => {
    const source = await readFile(new URL("../apps/web/src/data/social-accounts.ts", import.meta.url), "utf8");
    const publicRead = source.match(/export async function getSocialAccountConnections[\s\S]*?(?=\nexport async function|$)/)?.[0];
    expect(publicRead).toBeDefined();
    expect(publicRead).not.toMatch(/encryptedAccessToken|encryptedRefreshToken|credential:/);
  });
});
