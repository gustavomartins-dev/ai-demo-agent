import { describe, expect, it } from "vitest";

import { canonicalRequestUrl } from "../apps/web/src/lib/canonical-origin.js";

describe("canonicalRequestUrl", () => {
  it("redirects localhost to the configured loopback origin and preserves callback data", () => {
    expect(canonicalRequestUrl(
      "http://localhost:3000/api/social/oauth/x/callback?code=abc&state=def",
      "http://127.0.0.1:3000",
    )?.toString()).toBe("http://127.0.0.1:3000/api/social/oauth/x/callback?code=abc&state=def");
  });

  it("does nothing when the request already uses the canonical origin", () => {
    expect(canonicalRequestUrl("http://127.0.0.1:3000/login", "http://127.0.0.1:3000")).toBeNull();
  });

  it("does nothing when no base URL is configured", () => {
    expect(canonicalRequestUrl("http://localhost:3000/login")).toBeNull();
  });
});
