import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { canonicalRequestUrl } from "@/lib/canonical-origin";

export function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  const configuredBaseUrl = process.env.APP_BASE_URL;
  if (!configuredBaseUrl) return NextResponse.next();
  const canonical = new URL(configuredBaseUrl);
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || request.headers.get("host");
  if (requestHost === canonical.host) return NextResponse.next();
  const redirectUrl = canonicalRequestUrl(request.url, configuredBaseUrl);
  return redirectUrl ? NextResponse.redirect(redirectUrl, 307) : NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|brand-mark.png).*)"],
};
