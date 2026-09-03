import { describe, expect, it } from "vitest";

import { githubOAuthCallbackUrl } from "../apps/web/src/lib/github-oauth-fetch.js";

describe("GitHub OAuth token exchange", () => {
  it("uses the canonical callback configured for the application", () => {
    expect(githubOAuthCallbackUrl({ AUTH_URL: "http://127.0.0.1:3000" })).toBe(
      "http://127.0.0.1:3000/api/auth/callback/github",
    );
  });
});
