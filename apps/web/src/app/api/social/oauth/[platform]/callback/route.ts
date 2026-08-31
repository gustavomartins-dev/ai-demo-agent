import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { consumeSocialOAuthAttempt, saveConnectedSocialAccount } from "@/data/social-accounts";
import { loadSocialOAuthConfig, parseSocialOAuthPlatform } from "@/lib/social-oauth/config";
import { loadTokenEncryptionConfig } from "@/lib/social-oauth/crypto";
import { hashOAuthState } from "@/lib/social-oauth/flow";
import { exchangeSocialAuthorizationCode, fetchSocialIdentity } from "@/lib/social-oauth/provider-client";

function dashboard(request: Request, result: string, platform: string) {
  const url = new URL("/", request.url);
  url.searchParams.set("social", result);
  url.searchParams.set("platform", platform.toLowerCase());
  return NextResponse.redirect(url);
}

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL("/login?callbackUrl=/", request.url));
  const platform = parseSocialOAuthPlatform((await params).platform);
  if (!platform) return new Response("Unsupported social platform", { status: 404 });
  const query = new URL(request.url).searchParams;
  const state = query.get("state");
  if (!state) return dashboard(request, "invalid_state", platform);

  try {
    const encryption = loadTokenEncryptionConfig();
    const attempt = await consumeSocialOAuthAttempt(session.user.id, platform, hashOAuthState(state), encryption);
    if (!attempt) return dashboard(request, "invalid_state", platform);
    if (query.has("error")) return dashboard(request, "denied", platform);
    const code = query.get("code");
    if (!code) return dashboard(request, "missing_code", platform);

    const config = loadSocialOAuthConfig(platform);
    const token = await exchangeSocialAuthorizationCode(config, code, attempt.codeVerifier);
    const identity = await fetchSocialIdentity(platform, token.accessToken);
    const now = Date.now();
    await saveConnectedSocialAccount(session.user.id, platform, {
      ...identity,
      scopes: token.scopes,
      accessToken: token.accessToken,
      ...(token.refreshToken ? { refreshToken: token.refreshToken } : {}),
      accessTokenExpiresAt: token.expiresIn ? new Date(now + token.expiresIn * 1_000) : null,
      refreshTokenExpiresAt: token.refreshTokenExpiresIn ? new Date(now + token.refreshTokenExpiresIn * 1_000) : null,
    }, encryption);
    return dashboard(request, "connected", platform);
  } catch {
    return dashboard(request, "provider_error", platform);
  }
}
