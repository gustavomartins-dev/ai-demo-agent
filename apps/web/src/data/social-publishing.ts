import type { SocialPlatform } from "@prisma/client";

import { db } from "@/lib/db";
import { socialContentHash } from "@/lib/social-approval";
import { decryptSecret, loadTokenEncryptionConfig } from "@/lib/social-oauth/crypto";
import { publishSocialPost, SocialPublishProviderError, type PublishResult } from "@/lib/social-publishing/provider";

type Publisher = (
  platform: "X" | "LINKEDIN",
  content: string,
  accessToken: string,
  identity: { externalAccountId: string; handle: string | null },
) => Promise<PublishResult>;

export type PublishOutcome =
  | { status: "published"; projectId: string; url: string }
  | { status: "already_handled"; projectId: string; url: string | null }
  | { status: "blocked"; projectId?: string }
  | { status: "failed"; projectId: string; code: string };

export async function publishApprovedOwnedSocialDraft(
  ownerId: string,
  draftId: string,
  publisher?: Publisher,
): Promise<PublishOutcome> {
  const encryption = loadTokenEncryptionConfig();
  const prepared = await db.$transaction(async (transaction) => {
    const draft = await transaction.socialDraft.findFirst({
      where: { id: draftId, generationRun: { project: { ownerId } } },
      select: {
        id: true, platform: true, status: true, content: true, approvedContent: true, approvedContentHash: true,
        publishedPostUrl: true, generationRun: { select: { id: true, projectId: true } },
      },
    });
    if (!draft) return { kind: "blocked" as const };
    if (draft.publishedPostUrl || draft.status === "PUBLISHED") {
      return { kind: "handled" as const, projectId: draft.generationRun.projectId, url: draft.publishedPostUrl };
    }
    if (!draft.approvedContent || !draft.approvedContentHash || draft.status !== "APPROVED") {
      return { kind: "blocked" as const, projectId: draft.generationRun.projectId };
    }
    if (draft.content !== draft.approvedContent || socialContentHash(draft.platform, draft.approvedContent) !== draft.approvedContentHash) {
      return { kind: "blocked" as const, projectId: draft.generationRun.projectId };
    }
    const existing = await transaction.publishAttempt.findUnique({
      where: { socialDraftId_approvalHash: { socialDraftId: draft.id, approvalHash: draft.approvedContentHash } },
      select: { providerPostUrl: true },
    });
    if (existing) return { kind: "handled" as const, projectId: draft.generationRun.projectId, url: existing.providerPostUrl };
    const account = await transaction.socialAccount.findFirst({
      where: {
        userId: ownerId,
        platform: draft.platform,
        status: "CONNECTED",
        OR: [{ authorizationExpiresAt: null }, { authorizationExpiresAt: { gt: new Date() } }],
      },
      select: {
        externalAccountId: true, handle: true, scopes: true,
        credential: { select: { encryptedAccessToken: true, encryptionKeyId: true } },
      },
    });
    const requiredScope = draft.platform === "X" ? "tweet.write" : "w_member_social";
    if (!account?.credential || !account.externalAccountId || !account.scopes.includes(requiredScope)) {
      return { kind: "blocked" as const, projectId: draft.generationRun.projectId };
    }
    if (account.credential.encryptionKeyId !== encryption.keyId) throw new Error("Social credential uses an unavailable encryption key");
    const attempt = await transaction.publishAttempt.create({
      data: { socialDraftId: draft.id, approvalHash: draft.approvedContentHash },
      select: { id: true },
    });
    const claimed = await transaction.socialDraft.updateMany({ where: { id: draft.id, status: "APPROVED" }, data: { status: "PUBLISHING" } });
    if (claimed.count !== 1) throw new Error("Draft publication claim was lost");
    return {
      kind: "ready" as const,
      attemptId: attempt.id,
      draftId: draft.id,
      runId: draft.generationRun.id,
      projectId: draft.generationRun.projectId,
      platform: draft.platform as SocialPlatform,
      content: draft.approvedContent,
      encryptedAccessToken: account.credential.encryptedAccessToken,
      externalAccountId: account.externalAccountId,
      handle: account.handle,
    };
  });

  if (prepared.kind === "blocked") return { status: "blocked", ...(prepared.projectId ? { projectId: prepared.projectId } : {}) };
  if (prepared.kind === "handled") return { status: "already_handled", projectId: prepared.projectId, url: prepared.url };
  const accessToken = decryptSecret(prepared.encryptedAccessToken, encryption);
  const callProvider = publisher ?? ((platform, content, token, identity) => publishSocialPost(platform, content, token, identity, {
    linkedInVersion: process.env.LINKEDIN_API_VERSION,
  }));
  try {
    const result = await callProvider(prepared.platform, prepared.content, accessToken, {
      externalAccountId: prepared.externalAccountId,
      handle: prepared.handle,
    });
    await db.$transaction(async (transaction) => {
      await transaction.publishAttempt.update({ where: { id: prepared.attemptId }, data: { status: "SUCCEEDED", providerPostId: result.providerPostId, providerPostUrl: result.providerPostUrl, completedAt: new Date() } });
      await transaction.socialDraft.update({ where: { id: prepared.draftId }, data: { status: "PUBLISHED", publishedPostId: result.providerPostId, publishedPostUrl: result.providerPostUrl, publishedAt: new Date() } });
      const [totalDrafts, publishedDrafts] = await Promise.all([
        transaction.socialDraft.count({ where: { generationRunId: prepared.runId } }),
        transaction.socialDraft.count({ where: { generationRunId: prepared.runId, status: "PUBLISHED" } }),
      ]);
      if (totalDrafts >= 2 && publishedDrafts === totalDrafts) {
        await transaction.generationRun.update({ where: { id: prepared.runId }, data: { status: "PUBLISHED" } });
        await transaction.project.update({ where: { id: prepared.projectId }, data: { status: "PUBLISHED" } });
      }
    });
    return { status: "published", projectId: prepared.projectId, url: result.providerPostUrl };
  } catch (error) {
    const providerError = error instanceof SocialPublishProviderError ? error : new SocialPublishProviderError("internal_error", true);
    await db.$transaction([
      db.publishAttempt.update({ where: { id: prepared.attemptId }, data: { status: providerError.ambiguous ? "UNKNOWN" : "FAILED", errorCode: providerError.code, completedAt: new Date() } }),
      db.socialDraft.update({ where: { id: prepared.draftId }, data: { status: "FAILED" } }),
    ]);
    return { status: "failed", projectId: prepared.projectId, code: providerError.code };
  }
}
