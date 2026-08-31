import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";

import { publishSocialPost, SocialPublishProviderError } from "../apps/web/src/lib/social-publishing/provider.js";

describe("official social publishing clients", () => {
  it("publishes the approved text to X and returns its canonical URL", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "tweet-123", text: "hello" } }), { status: 201 }));
    await expect(publishSocialPost("X", "hello", "secret", { externalAccountId: "x-1", handle: "@gustavo" }, { fetcher })).resolves.toEqual({
      providerPostId: "tweet-123",
      providerPostUrl: "https://x.com/gustavo/status/tweet-123",
    });
    expect(fetcher).toHaveBeenCalledWith("https://api.x.com/2/tweets", expect.objectContaining({ method: "POST", body: JSON.stringify({ text: "hello" }) }));
  });

  it("publishes a LinkedIn member post with the required version and Rest.li headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:123" } }));
    const result = await publishSocialPost("LINKEDIN", "hello", "secret", { externalAccountId: "li-1", handle: null }, { linkedInVersion: "202608", fetcher });
    expect(result.providerPostId).toBe("urn:li:share:123");
    expect(fetcher).toHaveBeenCalledWith("https://api.linkedin.com/rest/posts", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "Linkedin-Version": "202608", "X-Restli-Protocol-Version": "2.0.0" }),
    }));
  });

  it("classifies network and server failures as ambiguous without leaking secrets", async () => {
    const network = publishSocialPost("X", "hello", "secret-token", { externalAccountId: "x-1", handle: "@gustavo" }, { fetcher: vi.fn().mockRejectedValue(new Error("secret-token")) });
    await expect(network).rejects.toMatchObject({ code: "network_or_timeout", ambiguous: true });
    await expect(network).rejects.not.toThrow(/secret-token/);
    const server = publishSocialPost("X", "hello", "secret", { externalAccountId: "x-1", handle: "@gustavo" }, { fetcher: vi.fn().mockResolvedValue(new Response("", { status: 503 })) });
    await expect(server).rejects.toEqual(expect.any(SocialPublishProviderError));
    await expect(server).rejects.toMatchObject({ code: "http_503", ambiguous: true });
  });
});

describe("publishing safety contract", () => {
  it("claims an exact approval once before calling the provider", async () => {
    const source = await readFile(new URL("../apps/web/src/data/social-publishing.ts", import.meta.url), "utf8");
    expect(source).toContain("socialDraftId_approvalHash");
    expect(source).toContain('status: "APPROVED"');
    expect(source).toContain("draft.content !== draft.approvedContent");
    expect(source).toContain("socialContentHash(draft.platform, draft.approvedContent)");
    expect(source.indexOf("transaction.publishAttempt.create")).toBeLessThan(source.indexOf("await callProvider"));
    expect(source).toContain('providerError.ambiguous ? "UNKNOWN" : "FAILED"');
  });
});
