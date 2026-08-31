import { Prisma, type GenerationRun, type Project } from "@prisma/client";

import { db } from "@/lib/db";
import { retryDelayMs } from "@/lib/generation-queue-policy";

const activeStatuses = ["ANALYZING", "PLANNING", "RECORDING", "DRAFTING"] as const;

export type ClaimedGenerationRun = GenerationRun & {
  project: Pick<Project, "id" | "name" | "productUrl" | "repositoryUrl" | "isOpenSource">;
};

export async function claimGenerationRun(
  workerId: string,
  leaseDurationMs: number,
  now = new Date(),
): Promise<ClaimedGenerationRun | null> {
  if (!workerId.trim()) throw new Error("workerId is required");
  if (!Number.isFinite(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error("leaseDurationMs must be positive");
  }

  const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);
  return db.$transaction(async (transaction) => {
    await transaction.generationRun.updateMany({
      where: {
        status: { in: [...activeStatuses] },
        leaseExpiresAt: { lt: now },
        attemptCount: { gte: db.generationRun.fields.maxAttempts },
      },
      data: {
        status: "FAILED",
        error: "Worker lease expired after the maximum number of attempts.",
        completedAt: now,
        workerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
      },
    });

    const claimed = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      WITH candidate AS (
        SELECT "id"
        FROM "GenerationRun"
        WHERE "attemptCount" < "maxAttempts"
          AND (
            ("status" = 'QUEUED' AND "nextAttemptAt" <= ${now})
            OR (
              "status" IN ('ANALYZING', 'PLANNING', 'RECORDING', 'DRAFTING')
              AND "leaseExpiresAt" < ${now}
            )
          )
        ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "GenerationRun" AS run
      SET "status" = 'ANALYZING'::"RunStatus",
          "workerId" = ${workerId},
          "leaseExpiresAt" = ${leaseExpiresAt},
          "lastHeartbeatAt" = ${now},
          "attemptCount" = run."attemptCount" + 1,
          "startedAt" = COALESCE(run."startedAt", ${now}),
          "completedAt" = NULL,
          "error" = NULL,
          "updatedAt" = ${now}
      FROM candidate
      WHERE run."id" = candidate."id"
      RETURNING run."id"
    `);

    const runId = claimed[0]?.id;
    if (!runId) return null;
    return transaction.generationRun.findFirst({
      where: { id: runId, workerId },
      include: {
        project: {
          select: { id: true, name: true, productUrl: true, repositoryUrl: true, isOpenSource: true },
        },
      },
    });
  });
}

export async function renewGenerationRunLease(
  runId: string,
  workerId: string,
  leaseDurationMs: number,
  now = new Date(),
): Promise<boolean> {
  const result = await db.generationRun.updateMany({
    where: { id: runId, workerId, status: { in: [...activeStatuses] } },
    data: {
      lastHeartbeatAt: now,
      leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
    },
  });
  return result.count === 1;
}

export async function markGenerationRunFailed(
  runId: string,
  workerId: string,
  error: string,
  now = new Date(),
): Promise<"retrying" | "failed" | "lost-lease"> {
  return db.$transaction(async (transaction) => {
    const run = await transaction.generationRun.findFirst({
      where: { id: runId, workerId },
      select: { attemptCount: true, maxAttempts: true },
    });
    if (!run) return "lost-lease";

    const exhausted = run.attemptCount >= run.maxAttempts;
    const result = await transaction.generationRun.updateMany({
      where: { id: runId, workerId },
      data: exhausted
        ? {
            status: "FAILED",
            error,
            completedAt: now,
            workerId: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
          }
        : {
            status: "QUEUED",
            error,
            nextAttemptAt: new Date(now.getTime() + retryDelayMs(run.attemptCount)),
            workerId: null,
            leaseExpiresAt: null,
            lastHeartbeatAt: null,
          },
    });
    if (result.count !== 1) return "lost-lease";
    return exhausted ? "failed" : "retrying";
  });
}
