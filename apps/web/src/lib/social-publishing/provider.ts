import { z } from "zod";

type Fetcher = typeof fetch;
export type PublishPlatform = "X" | "LINKEDIN";
export type PublishResult = { providerPostId: string; providerPostUrl: string };

export class SocialPublishProviderError extends Error {
  constructor(readonly code: string, readonly ambiguous: boolean) {
    super(`Social provider request failed: ${code}`);
    this.name = "SocialPublishProviderError";
  }
}

const xResponseSchema = z.object({ data: z.object({ id: z.string().min(1) }) });

export async function publishSocialPost(
  platform: PublishPlatform,
  content: string,
  accessToken: string,
  identity: { externalAccountId: string; handle: string | null },
  options: { linkedInVersion?: string; fetcher?: Fetcher } = {},
): Promise<PublishResult> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    if (platform === "X") {
      response = await fetcher("https://api.x.com/2/tweets", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ text: content }),
        signal: AbortSignal.timeout(15_000),
      });
    } else {
      if (!options.linkedInVersion || !/^\d{6}$/.test(options.linkedInVersion)) {
        throw new SocialPublishProviderError("linkedin_version_missing", false);
      }
      response = await fetcher("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "Linkedin-Version": options.linkedInVersion,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({
          author: `urn:li:person:${identity.externalAccountId}`,
          commentary: content,
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: "PUBLISHED",
          isReshareDisabledByAuthor: false,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    }
  } catch (error) {
    if (error instanceof SocialPublishProviderError) throw error;
    throw new SocialPublishProviderError("network_or_timeout", true);
  }
  if (!response.ok) throw new SocialPublishProviderError(`http_${response.status}`, response.status >= 500);

  if (platform === "X") {
    const parsed = xResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new SocialPublishProviderError("invalid_success_response", true);
    const username = identity.handle?.replace(/^@/, "");
    if (!username) throw new SocialPublishProviderError("missing_verified_handle", true);
    return { providerPostId: parsed.data.data.id, providerPostUrl: `https://x.com/${username}/status/${parsed.data.data.id}` };
  }
  const postId = response.headers.get("x-restli-id");
  if (!postId) throw new SocialPublishProviderError("missing_restli_id", true);
  return { providerPostId: postId, providerPostUrl: `https://www.linkedin.com/feed/update/${postId}` };
}
