import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { createSocialOAuthAttempt } from "@/data/social-accounts";
import { loadSocialOAuthConfig, parseSocialOAuthPlatform } from "@/lib/social-oauth/config";
import { loadTokenEncryptionConfig } from "@/lib/social-oauth/crypto";
import { createSocialOAuthStart } from "@/lib/social-oauth/flow";

export async function GET(request: Request, { params }: { params: Promise<{ platform: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", new URL(request.url).pathname);
    return NextResponse.redirect(login);
  }
  const platform = parseSocialOAuthPlatform((await params).platform);
  if (!platform) return new Response("Unsupported social platform", { status: 404 });
  try {
    const config = loadSocialOAuthConfig(platform);
    const encryption = loadTokenEncryptionConfig();
    const start = createSocialOAuthStart(config);
    await createSocialOAuthAttempt(session.user.id, platform, start, encryption);
    return NextResponse.redirect(start.authorizationUrl);
  } catch (error) {
    const reference = crypto.randomUUID().slice(0, 8);
    console.error(JSON.stringify({ event: "social_oauth.start_failed", reference, platform, error: error instanceof Error ? error.name : "UnknownError" }));
    return NextResponse.redirect(new URL(`/?social=configuration_error&platform=${platform.toLowerCase()}&reference=${reference}`, request.url));
  }
}
