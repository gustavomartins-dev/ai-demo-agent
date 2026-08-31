import { Prisma } from "@prisma/client";

import type { SocialDraftBundle, VerifiedSocialContext } from "../../../../src/social/contract.js";
import { db } from "../lib/db.js";

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
