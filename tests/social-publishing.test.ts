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

  it("uploads the generated video and attaches its URN to the LinkedIn post", async () => {
    const video = Uint8Array.from([1, 2, 3, 4, 5, 6, 7, 8]);
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: {
          video: "urn:li:video:demo-123",
          uploadToken: "upload-token",
          uploadInstructions: [
            { uploadUrl: "https://upload.linkedin.test/part-1", firstByte: 0, lastByte: 3 },
            { uploadUrl: "https://upload.linkedin.test/part-2", firstByte: 4, lastByte: 7 },
          ],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"part-1"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { etag: '"part-2"' } }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:video-post" } }));

    await expect(publishSocialPost(
      "LINKEDIN",
      "the approved copy",
      "secret",
      { externalAccountId: "li-1", handle: null },
      {
        linkedInVersion: "202608",
        fetcher,
        media: { kind: "video", contentType: "video/mp4", data: video, title: "DemoAgent demo" },
      },
    )).resolves.toEqual({
      providerPostId: "urn:li:share:video-post",
      providerPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:video-post",
    });

    expect(fetcher).toHaveBeenNthCalledWith(1, "https://api.linkedin.com/rest/videos?action=initializeUpload", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"fileSizeBytes":8'),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, "https://upload.linkedin.test/part-1", expect.objectContaining({ method: "PUT" }));
    expect(fetcher).toHaveBeenNthCalledWith(3, "https://upload.linkedin.test/part-2", expect.objectContaining({ method: "PUT" }));
    expect(fetcher).toHaveBeenNthCalledWith(4, "https://api.linkedin.com/rest/videos?action=finalizeUpload", expect.objectContaining({
      method: "POST",
      body: expect.stringContaining('"uploadedPartIds":["part-1","part-2"]'),
    }));
    const postRequest = fetcher.mock.calls[4]?.[1] as RequestInit;
    expect(JSON.parse(String(postRequest.body))).toMatchObject({
      commentary: "the approved copy",
      content: { media: { title: "DemoAgent demo", id: "urn:li:video:demo-123" } },
    });
  });

  it("fails safely before creating a LinkedIn post when an uploaded part has no ETag", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        value: {
          video: "urn:li:video:demo-123",
          uploadToken: "upload-token",
          uploadInstructions: [{ uploadUrl: "https://upload.linkedin.test/part", firstByte: 0, lastByte: 3 }],
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const request = publishSocialPost(
      "LINKEDIN",
      "hello",
      "secret",
      { externalAccountId: "li-1", handle: null },
      {
        linkedInVersion: "202608",
        fetcher,
        media: { kind: "video", contentType: "video/mp4", data: Uint8Array.from([1, 2, 3, 4]), title: "Demo" },
      },
    );
    await expect(request).rejects.toMatchObject({ code: "linkedin_video_missing_etag", ambiguous: false });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("classifies network and server failures as ambiguous without leaking secrets", async () => {
    const network = publishSocialPost("X", "hello", "secret-token", { externalAccountId: "x-1", handle: "@gustavo" }, { fetcher: vi.fn().mockRejectedValue(new Error("secret-token")) });
    await expect(network).rejects.toMatchObject({ code: "network_or_timeout", ambiguous: true });
    await expect(network).rejects.not.toThrow(/secret-token/);
    const server = publishSocialPost("X", "hello", "secret", { externalAccountId: "x-1", handle: "@gustavo" }, { fetcher: vi.fn().mockResolvedValue(new Response("", { status: 503 })) });
    await expect(server).rejects.toEqual(expect.any(SocialPublishProviderError));
    await expect(server).rejects.toMatchObject({ code: "http_503", ambiguous: true });
  });

  it("classifies a rate limit as a known provider rejection", async () => {
    const request = publishSocialPost("X", "hello", "secret", { externalAccountId: "x-1", handle: "@gustavo" }, {
      fetcher: vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 })),
    });
    await expect(request).rejects.toMatchObject({ code: "http_429", ambiguous: false });
    await expect(request).rejects.not.toThrow(/rate limited|secret/);
  });

  it("treats an incomplete success as ambiguous to prevent a duplicate retry", async () => {
    const request = publishSocialPost("LINKEDIN", "hello", "secret", { externalAccountId: "li-1", handle: null }, {
      linkedInVersion: "202608",
      fetcher: vi.fn().mockResolvedValue(new Response(null, { status: 201 })),
    });
    await expect(request).rejects.toMatchObject({ code: "missing_restli_id", ambiguous: true });
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
    expect(source).toContain('if (existing) return { kind: "handled"');
    expect(source).toContain("publishedDrafts === totalDrafts");
    expect(source).toContain('data: { status: "PUBLISHED" }');
  });
});
