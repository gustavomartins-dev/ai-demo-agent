import { z } from "zod";
import type { SocialOAuthConfig, SocialOAuthPlatform } from "./config.js";

type Fetcher = typeof fetch;

const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  expires_in: z.number().int().positive().optional(),
  refresh_token_expires_in: z.number().int().positive().optional(),
  scope: z.string().optional(),
});

const xIdentitySchema = z.object({
  data: z.object({ id: z.string().min(1), name: z.string().min(1), username: z.string().min(1) }),
});

const linkedInIdentitySchema = z.object({
  sub: z.string().min(1),
  name: z.string().min(1),
});

export type SocialTokenResponse = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  refreshTokenExpiresIn?: number;
  scopes: string[];
};

export type SocialIdentity = { externalAccountId: string; displayName: string; handle: string | null };

async function providerJson(response: Response, operation: string): Promise<unknown> {
  if (!response.ok) throw new Error(`${operation} failed with provider status ${response.status}`);
  return response.json();
}

export async function exchangeSocialAuthorizationCode(
  config: SocialOAuthConfig,
  code: string,
  codeVerifier: string | null,
  fetcher: Fetcher = fetch,
): Promise<SocialTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
  });
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  if (config.platform === "X") {
    if (!codeVerifier) throw new Error("X OAuth callback requires a PKCE verifier");
    body.set("code_verifier", codeVerifier);
    if (config.clientSecret) {
      headers.Authorization = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`;
    } else {
      body.set("client_id", config.clientId);
    }
  } else {
    body.set("client_id", config.clientId);
    body.set("client_secret", config.clientSecret ?? "");
  }
  const response = await fetcher(config.tokenEndpoint, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(15_000),
  });
  const token = tokenSchema.parse(await providerJson(response, `${config.platform} token exchange`));
  return {
    accessToken: token.access_token,
    ...(token.refresh_token ? { refreshToken: token.refresh_token } : {}),
    ...(token.expires_in ? { expiresIn: token.expires_in } : {}),
    ...(token.refresh_token_expires_in ? { refreshTokenExpiresIn: token.refresh_token_expires_in } : {}),
    scopes: token.scope?.split(/[ ,]+/).filter(Boolean) ?? config.scopes,
  };
}

export async function fetchSocialIdentity(
  platform: SocialOAuthPlatform,
  accessToken: string,
  fetcher: Fetcher = fetch,
): Promise<SocialIdentity> {
  const endpoint = platform === "X" ? "https://api.x.com/2/users/me" : "https://api.linkedin.com/v2/userinfo";
  const response = await fetcher(endpoint, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await providerJson(response, `${platform} identity lookup`);
  if (platform === "X") {
    const identity = xIdentitySchema.parse(payload).data;
    return { externalAccountId: identity.id, displayName: identity.name, handle: `@${identity.username}` };
  }
  const identity = linkedInIdentitySchema.parse(payload);
  return { externalAccountId: identity.sub, displayName: identity.name, handle: null };
}
