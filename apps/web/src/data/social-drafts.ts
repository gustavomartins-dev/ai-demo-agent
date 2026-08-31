import { Prisma } from "@prisma/client";

import type { SocialDraftBundle, VerifiedSocialContext } from "../../../../src/social/contract.js";
import { db } from "@/lib/db";
import { socialContentHash } from "@/lib/social-approval";

export async function saveSocialDraftBundle(
  runId: string,
  workerId: string,
  bundle: SocialDraftBundle,
  context: VerifiedSocialContext,
): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const owned = await transaction.generationRun.findFirst({
      where: { id: runId, workerId, status: "DRAFTING" },
      select: { projectId: true },
    });
    if (!owned) return false;

    for (const draft of [bundle.x, bundle.linkedin]) {
      const evidence = context.verifiedClaims.filter((claim) => draft.claimIds.includes(claim.id));
      await transaction.socialDraft.upsert({
        where: { generationRunId_platform: { generationRunId: runId, platform: draft.platform } },
        create: {
          generationRunId: runId,
          platform: draft.platform,
          language: draft.language,
          content: draft.content,
          mentions: draft.mentions as Prisma.InputJsonValue,
          claimIds: draft.claimIds as Prisma.InputJsonValue,
          evidence: evidence as Prisma.InputJsonValue,
          repositoryUrl: context.project.isOpenSource ? context.project.repositoryUrl : null,
        },
        update: {
          status: "DRAFT",
          language: draft.language,
          content: draft.content,
          mentions: draft.mentions as Prisma.InputJsonValue,
          claimIds: draft.claimIds as Prisma.InputJsonValue,
          evidence: evidence as Prisma.InputJsonValue,
          repositoryUrl: context.project.isOpenSource ? context.project.repositoryUrl : null,
          approvedAt: null,
          approvedByUserId: null,
          approvedContent: null,
          approvedContentHash: null,
        },
      });
    }

    await transaction.generationRun.update({
      where: { id: runId },
      data: {
        status: "READY_FOR_REVIEW",
        completedAt: new Date(),
        workerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
        error: null,
      },
    });
    await transaction.project.update({ where: { id: owned.projectId }, data: { status: "REVIEW" } });
    return true;
  });
}

export async function approveOwnedSocialDraft(
  ownerId: string,
  draftId: string,
  now = new Date(),
): Promise<{ projectId: string; platform: "X" | "LINKEDIN" } | null> {
  return db.$transaction(async (transaction) => {
    const draft = await transaction.socialDraft.findFirst({
      where: { id: draftId, generationRun: { project: { ownerId } } },
      select: {
        id: true,
        platform: true,
        content: true,
        evidence: true,
        claimIds: true,
        generationRun: { select: { projectId: true } },
      },
    });
    if (!draft || !Array.isArray(draft.evidence) || draft.evidence.length === 0 || !Array.isArray(draft.claimIds) || draft.claimIds.length === 0) return null;
    const account = await transaction.socialAccount.findFirst({
      where: {
        userId: ownerId,
        platform: draft.platform,
        status: "CONNECTED",
        OR: [{ authorizationExpiresAt: null }, { authorizationExpiresAt: { gt: now } }],
      },
      select: { credential: { select: { id: true } } },
    });
    if (!account?.credential) return null;
    const approved = await transaction.socialDraft.updateMany({
      where: { id: draft.id, generationRun: { project: { ownerId } } },
      data: {
        status: "APPROVED",
        approvedAt: now,
        approvedByUserId: ownerId,
        approvedContent: draft.content,
        approvedContentHash: socialContentHash(draft.platform, draft.content),
      },
    });
    return approved.count === 1 ? { projectId: draft.generationRun.projectId, platform: draft.platform } : null;
  });
}
