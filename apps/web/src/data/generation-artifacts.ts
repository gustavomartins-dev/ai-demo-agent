import { stat } from "node:fs/promises";
import path from "node:path";
import { Prisma } from "@prisma/client";

import type { DemoExecutionReport } from "../../../../src/runner.js";
import { db } from "../lib/db.js";

export type RecordingArtifacts = {
  videoPath: string | null;
  reportPath: string;
  report: DemoExecutionReport;
};

function storageKey(filePath: string, outputRoot: string): string {
  const relative = path.relative(path.resolve(outputRoot), path.resolve(filePath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Recording artifact is outside AI_DEMO_OUTPUT_ROOT");
  }
  return relative.split(path.sep).join("/");
}

async function asset(filePath: string, outputRoot: string, type: "VIDEO" | "EXECUTION_REPORT" | "EVIDENCE", status: "READY" | "FAILED") {
  return {
    type,
    status,
    storageKey: storageKey(filePath, outputRoot),
    mimeType: type === "VIDEO" ? "video/webm" : type === "EVIDENCE" ? "image/png" : "application/json",
    sizeBytes: BigInt((await stat(filePath)).size),
  };
}

export async function registerRecordingArtifacts(
  runId: string,
  workerId: string,
  artifacts: RecordingArtifacts,
  outputRoot: string,
  succeeded: boolean,
): Promise<boolean> {
  const status = succeeded ? "READY" : "FAILED";
  const reportDirectory = path.dirname(artifacts.reportPath);
  const records = [await asset(artifacts.reportPath, outputRoot, "EXECUTION_REPORT", status)];
  if (artifacts.videoPath) records.push(await asset(artifacts.videoPath, outputRoot, "VIDEO", status));
  for (const step of artifacts.report.steps) {
    if (step.evidencePath) records.push(await asset(path.join(reportDirectory, step.evidencePath), outputRoot, "EVIDENCE", status));
  }

  return db.$transaction(async (transaction) => {
    const owned = await transaction.generationRun.findFirst({
      where: { id: runId, workerId, status: "RECORDING" },
      select: { projectId: true },
    });
    if (!owned) return false;

    await transaction.mediaAsset.createMany({
      data: records.map((record) => ({
        ...record,
        generationRunId: runId,
        metadata: { executionStatus: artifacts.report.status } as Prisma.InputJsonValue,
      })),
    });
    if (succeeded) {
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
    }
    return true;
  });
}
