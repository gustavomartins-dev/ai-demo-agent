import { hostname } from "node:os";
import { z } from "zod";

const positiveInteger = (fallback: number, minimum: number, maximum: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? Number(value) : value),
    z.number().int().min(minimum).max(maximum).default(fallback),
  );

const workerEnvironmentSchema = z.object({
  AI_DEMO_WORKER_ID: z.string().trim().min(1).optional(),
  AI_DEMO_WORKER_POLL_MS: positiveInteger(2_000, 100, 60_000),
  AI_DEMO_WORKER_LEASE_MS: positiveInteger(120_000, 10_000, 900_000),
  AI_DEMO_WORKER_HEARTBEAT_MS: positiveInteger(30_000, 1_000, 300_000),
});

export type GenerationWorkerConfig = {
  workerId: string;
  pollIntervalMs: number;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
};

export function loadGenerationWorkerConfig(
  environment: NodeJS.ProcessEnv = process.env,
): GenerationWorkerConfig {
  const parsed = workerEnvironmentSchema.parse(environment);
  if (parsed.AI_DEMO_WORKER_HEARTBEAT_MS >= parsed.AI_DEMO_WORKER_LEASE_MS) {
    throw new Error("AI_DEMO_WORKER_HEARTBEAT_MS must be shorter than AI_DEMO_WORKER_LEASE_MS");
  }

  return {
    workerId: parsed.AI_DEMO_WORKER_ID ?? `${hostname()}-${process.pid}`,
    pollIntervalMs: parsed.AI_DEMO_WORKER_POLL_MS,
    leaseDurationMs: parsed.AI_DEMO_WORKER_LEASE_MS,
    heartbeatIntervalMs: parsed.AI_DEMO_WORKER_HEARTBEAT_MS,
  };
}
