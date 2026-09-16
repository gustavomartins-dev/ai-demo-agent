import { z } from "zod";

type Fetcher = typeof fetch;
export type PublishPlatform = "X" | "LINKEDIN";
export type PublishResult = { providerPostId: string; providerPostUrl: string };
export type PublishMedia = {
  kind: "video";
  contentType: string;
  data: Uint8Array;
  title: string;
};

export class SocialPublishProviderError extends Error {
  constructor(readonly code: string, readonly ambiguous: boolean) {
    super(`Social provider request failed: ${code}`);
    this.name = "SocialPublishProviderError";
  }
}

const xResponseSchema = z.object({ data: z.object({ id: z.string().min(1) }) });
const linkedInVideoInitializationSchema = z.object({
  value: z.object({
    video: z.string().startsWith("urn:li:video:"),
    uploadToken: z.string(),
    uploadInstructions: z.array(z.object({
      uploadUrl: z.string().url(),
      firstByte: z.number().int().nonnegative(),
      lastByte: z.number().int().nonnegative(),
    })).min(1),
  }),
});

function linkedInHeaders(accessToken: string, version: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "Linkedin-Version": version,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

async function linkedInVideoRequest(
  fetcher: Fetcher,
  url: string,
  init: RequestInit,
  failureCode: string,
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    // Upload failures cannot have created a post, so retrying a newly approved
    // snapshot is safe. Only the final Posts API request can be ambiguous.
    throw new SocialPublishProviderError(`${failureCode}_network`, false);
  }
  if (!response.ok) throw new SocialPublishProviderError(`${failureCode}_http_${response.status}`, false);
  return response;
}

async function uploadLinkedInVideo(
  fetcher: Fetcher,
  media: PublishMedia,
  accessToken: string,
  externalAccountId: string,
  linkedInVersion: string,
): Promise<string> {
  if (media.kind !== "video" || media.data.byteLength === 0) {
    throw new SocialPublishProviderError("linkedin_video_invalid", false);
  }

  const headers = linkedInHeaders(accessToken, linkedInVersion);
  const initializeResponse = await linkedInVideoRequest(
    fetcher,
    "https://api.linkedin.com/rest/videos?action=initializeUpload",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: `urn:li:person:${externalAccountId}`,
          fileSizeBytes: media.data.byteLength,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
    "linkedin_video_initialize",
  );

  let initialization: z.infer<typeof linkedInVideoInitializationSchema>;
  try {
    const parsed = linkedInVideoInitializationSchema.safeParse(await initializeResponse.json());
    if (!parsed.success) throw new Error("invalid response");
    initialization = parsed.data;
  } catch {
    throw new SocialPublishProviderError("linkedin_video_initialize_invalid_response", false);
  }

  const instructions = [...initialization.value.uploadInstructions].sort((left, right) => left.firstByte - right.firstByte);
  const uploadedPartIds: string[] = [];
  let nextByte = 0;
  for (const instruction of instructions) {
    if (instruction.firstByte !== nextByte || instruction.lastByte < instruction.firstByte || instruction.firstByte >= media.data.byteLength) {
      throw new SocialPublishProviderError("linkedin_video_invalid_byte_ranges", false);
    }
    const endExclusive = Math.min(instruction.lastByte + 1, media.data.byteLength);
    const chunk = Uint8Array.from(media.data.subarray(instruction.firstByte, endExclusive));
    const uploadResponse = await linkedInVideoRequest(
      fetcher,
      instruction.uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: new Blob([chunk], { type: "application/octet-stream" }),
        signal: AbortSignal.timeout(60_000),
      },
      "linkedin_video_upload",
    );
    const etag = uploadResponse.headers.get("etag")?.replace(/^"|"$/g, "");
    if (!etag) throw new SocialPublishProviderError("linkedin_video_missing_etag", false);
    uploadedPartIds.push(etag);
    nextByte = endExclusive;
    if (nextByte === media.data.byteLength) break;
  }
  if (nextByte !== media.data.byteLength) {
    throw new SocialPublishProviderError("linkedin_video_incomplete_byte_ranges", false);
  }

  await linkedInVideoRequest(
    fetcher,
    "https://api.linkedin.com/rest/videos?action=finalizeUpload",
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: initialization.value.video,
          uploadToken: initialization.value.uploadToken,
          uploadedPartIds,
        },
      }),
      signal: AbortSignal.timeout(15_000),
    },
    "linkedin_video_finalize",
  );
  return initialization.value.video;
}

export async function publishSocialPost(
  platform: PublishPlatform,
  content: string,
  accessToken: string,
  identity: { externalAccountId: string; handle: string | null },
  options: { linkedInVersion?: string; fetcher?: Fetcher; media?: PublishMedia } = {},
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
      const videoUrn = options.media
        ? await uploadLinkedInVideo(fetcher, options.media, accessToken, identity.externalAccountId, options.linkedInVersion)
        : null;
      response = await fetcher("https://api.linkedin.com/rest/posts", {
        method: "POST",
        headers: linkedInHeaders(accessToken, options.linkedInVersion),
        body: JSON.stringify({
          author: `urn:li:person:${identity.externalAccountId}`,
          commentary: content,
          visibility: "PUBLIC",
          distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
          ...(videoUrn ? { content: { media: { title: options.media?.title, id: videoUrn } } } : {}),
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
