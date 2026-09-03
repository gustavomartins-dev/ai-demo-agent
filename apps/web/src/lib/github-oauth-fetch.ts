export function githubOAuthCallbackUrl(environment: NodeJS.ProcessEnv = process.env): string {
  const origin = environment.AUTH_URL ?? environment.APP_BASE_URL;
  if (!origin) throw new Error("AUTH_URL is required for GitHub OAuth");
  return new URL("/api/auth/callback/github", origin).toString();
}

export const githubOAuthFetch: typeof fetch = async (input, init) => {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  if (url.startsWith("https://github.com/login/oauth/access_token") && init?.body instanceof URLSearchParams) {
    init.body.set("redirect_uri", githubOAuthCallbackUrl());
  }
  return fetch(input, init);
};
