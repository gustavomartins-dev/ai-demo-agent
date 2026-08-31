import { claimGenerationRun, markGenerationRunFailed, renewGenerationRunLease } from "@/data/generation-queue";
import { db } from "@/lib/db";
import { loadGenerationWorkerConfig } from "@/worker/config";
import { jsonWorkerLogger } from "@/worker/logger";
import { generationProcessorReady, processGenerationRun } from "@/worker/processor";
import { runGenerationWorker } from "@/worker/runtime";

async function main(): Promise<void> {
  const config = loadGenerationWorkerConfig();
  if (!generationProcessorReady) {
    jsonWorkerLogger({
      level: "error",
      event: "worker.processor_not_ready",
      workerId: config.workerId,
      error: "Complete issue #22 before starting the generation worker",
    });
    await db.$disconnect();
    process.exitCode = 1;
    return;
  }

  await startWorker(config);
}

async function startWorker(config: ReturnType<typeof loadGenerationWorkerConfig>): Promise<void> {
  const shutdown = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
      jsonWorkerLogger({ level: "info", event: "worker.shutdown_requested", workerId: config.workerId, signal });
      shutdown.abort(new Error(signal));
    });
  }

  try {
    await runGenerationWorker(
      config,
      { claim: claimGenerationRun, renew: renewGenerationRunLease, fail: markGenerationRunFailed },
      processGenerationRun,
      jsonWorkerLogger,
      shutdown.signal,
    );
  } finally {
    await db.$disconnect();
  }
}

void main().catch(async (error: unknown) => {
  jsonWorkerLogger({
    level: "error",
    event: "worker.crashed",
    workerId: "uninitialized",
    error: error instanceof Error ? error.message : String(error),
  });
  await db.$disconnect();
  process.exitCode = 1;
});
