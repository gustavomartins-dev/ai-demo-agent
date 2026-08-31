import type { ClaimedGenerationRun } from "@/data/generation-queue";
import type { GenerationWorkerConfig } from "@/worker/config";
import type { WorkerLogger } from "@/worker/logger";

export type GenerationQueue = {
  claim(workerId: string, leaseDurationMs: number): Promise<ClaimedGenerationRun | null>;
  renew(runId: string, workerId: string, leaseDurationMs: number): Promise<boolean>;
  fail(runId: string, workerId: string, error: string): Promise<"retrying" | "failed" | "lost-lease">;
};

export type GenerationProcessor = (
  run: ClaimedGenerationRun,
  context: { workerId: string; signal: AbortSignal },
) => Promise<void>;

export type WorkerRuntimeOptions = {
  runOnce?: boolean;
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function abortableSleep(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runGenerationWorker(
  config: GenerationWorkerConfig,
  queue: GenerationQueue,
  processRun: GenerationProcessor,
  logger: WorkerLogger,
  signal: AbortSignal,
  options: WorkerRuntimeOptions = {},
): Promise<void> {
  const sleep = options.sleep ?? abortableSleep;
  logger({ level: "info", event: "worker.started", workerId: config.workerId });

  while (!signal.aborted) {
    const run = await queue.claim(config.workerId, config.leaseDurationMs);
    if (!run) {
      logger({ level: "info", event: "worker.idle", workerId: config.workerId });
      if (options.runOnce) break;
      await sleep(config.pollIntervalMs, signal);
      continue;
    }

    logger({
      level: "info",
      event: "run.claimed",
      workerId: config.workerId,
      runId: run.id,
      attempt: run.attemptCount,
    });

    const runController = new AbortController();
    const abortRun = () => runController.abort(signal.reason);
    signal.addEventListener("abort", abortRun, { once: true });
    const heartbeat = setInterval(async () => {
      try {
        const renewed = await queue.renew(run.id, config.workerId, config.leaseDurationMs);
        if (!renewed) {
          logger({ level: "error", event: "run.lease_lost", workerId: config.workerId, runId: run.id });
          runController.abort(new Error("Generation run lease was lost"));
        }
      } catch (error) {
        logger({ level: "error", event: "run.heartbeat_failed", workerId: config.workerId, runId: run.id, error: errorMessage(error) });
      }
    }, config.heartbeatIntervalMs);

    try {
      await processRun(run, { workerId: config.workerId, signal: runController.signal });
      logger({ level: "info", event: "run.processed", workerId: config.workerId, runId: run.id });
    } catch (error) {
      const outcome = await queue.fail(run.id, config.workerId, errorMessage(error));
      logger({ level: "error", event: "run.failed", workerId: config.workerId, runId: run.id, outcome, error: errorMessage(error) });
    } finally {
      clearInterval(heartbeat);
      signal.removeEventListener("abort", abortRun);
    }

    if (options.runOnce) break;
  }

  logger({ level: "info", event: "worker.stopped", workerId: config.workerId });
}
