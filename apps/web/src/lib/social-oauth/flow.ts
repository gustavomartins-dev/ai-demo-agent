import { createHash, randomBytes } from "node:crypto";
import type { SocialOAuthConfig } from "./config.js";

export type SocialOAuthStart = {
  authorizationUrl: string;
  state: string;
  stateHash: string;
  codeVerifier: string | null;
};

function base64url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export function hashOAuthState(state: string): string {
  return createHash("sha256").update(state, "utf8").digest("hex");
}

export function createSocialOAuthStart(config: SocialOAuthConfig): SocialOAuthStart {
  const state = base64url(32);
  const codeVerifier = config.usesPkce ? base64url(64) : null;
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("state", state);
  if (codeVerifier) {
    url.searchParams.set("code_challenge", createHash("sha256").update(codeVerifier).digest("base64url"));
    url.searchParams.set("code_challenge_method", "S256");
  }
  return { authorizationUrl: url.toString(), state, stateHash: hashOAuthState(state), codeVerifier };
}

export function oauthStateMatches(receivedState: string, storedStateHash: string): boolean {
  if (!receivedState || !storedStateHash) return false;
  return hashOAuthState(receivedState) === storedStateHash;
}
