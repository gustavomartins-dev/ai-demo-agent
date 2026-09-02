export function canonicalRequestUrl(requestUrl: string, configuredBaseUrl?: string): URL | null {
  if (!configuredBaseUrl) return null;
  const incoming = new URL(requestUrl);
  const canonical = new URL(configuredBaseUrl);
  if (incoming.origin === canonical.origin) return null;

  const redirected = new URL(incoming.pathname + incoming.search, canonical.origin);
  return redirected;
}
