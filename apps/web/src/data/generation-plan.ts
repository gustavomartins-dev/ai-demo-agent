import { Prisma } from "@prisma/client";

import type { HermesDemoPlan } from "../../../../src/hermes/contract.js";
import { db } from "../lib/db.js";

export async function markGenerationRunPlanning(runId: string, workerId: string): Promise<boolean> {
  const result = await db.generationRun.updateMany({
    where: { id: runId, workerId, status: "ANALYZING" },
    data: { status: "PLANNING" },
  });
  return result.count === 1;
}

export async function saveGenerationRunPlan(
  runId: string,
  workerId: string,
  plan: HermesDemoPlan,
): Promise<boolean> {
  return db.$transaction(async (transaction) => {
    const result = await transaction.generationRun.updateMany({
      where: { id: runId, workerId, status: "PLANNING" },
      data: {
        status: "PLANNED",
        plan: plan as unknown as Prisma.InputJsonValue,
        workerId: null,
        leaseExpiresAt: null,
        lastHeartbeatAt: null,
      },
    });
    if (result.count !== 1) return false;
    await transaction.project.update({
      where: { id: (await transaction.generationRun.findUniqueOrThrow({ where: { id: runId }, select: { projectId: true } })).projectId },
      data: { status: "PROCESSING" },
    });
    return true;
  });
}
