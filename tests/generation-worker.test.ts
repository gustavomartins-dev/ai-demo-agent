import { describe, expect, it, vi } from "vitest";

import { loadGenerationWorkerConfig } from "../apps/web/src/worker/config.js";
import type { ClaimedGenerationRun } from "../apps/web/src/data/generation-queue.js";
import { runGenerationWorker, type GenerationQueue } from "../apps/web/src/worker/runtime.js";

const config = {
  workerId: "worker-test",
  pollIntervalMs: 100,
  leaseDurationMs: 10_000,
  heartbeatIntervalMs: 1_000,
};

function fakeRun() {
  return {
    id: "run-1",
    projectId: "project-1",
    objective: "Show the main flow",
    status: "ANALYZING" as const,
    plan: null,
    error: null,
    attemptCount: 1,
    maxAttempts: 3,
    workerId: "worker-test",
    leaseExpiresAt: new Date(),
    lastHeartbeatAt: new Date(),
    nextAttemptAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: "project-1", name: "Demo", productUrl: "https://example.com", repositoryUrl: null, isOpenSource: false },
  };
}

function queue(run: ClaimedGenerationRun | null = fakeRun()): GenerationQueue {
  return {
    claim: vi.fn().mockResolvedValue(run),
    renew: vi.fn().mockResolvedValue(true),
    fail: vi.fn().mockResolvedValue("retrying"),
  };
}

describe("generation worker runtime", () => {
  it("loads bounded configuration and rejects heartbeats longer than leases", () => {
    expect(loadGenerationWorkerConfig({ AI_DEMO_WORKER_ID: "worker-a" })).toMatchObject({ workerId: "worker-a" });
    expect(() => loadGenerationWorkerConfig({ AI_DEMO_WORKER_LEASE_MS: "10000", AI_DEMO_WORKER_HEARTBEAT_MS: "10000" })).toThrow(/shorter/);
  });

  it("stays idle without treating an empty queue as an error", async () => {
    const store = queue(null);
    await runGenerationWorker(config, store, vi.fn(), vi.fn(), new AbortController().signal, { runOnce: true });
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("processes one claimed run successfully", async () => {
    const store = queue();
    const processor = vi.fn().mockResolvedValue(undefined);
    await runGenerationWorker(config, store, processor, vi.fn(), new AbortController().signal, { runOnce: true });
    expect(processor).toHaveBeenCalledOnce();
    expect(store.fail).not.toHaveBeenCalled();
  });

  it("records processor failures through the queue policy", async () => {
    const store = queue();
    await runGenerationWorker(config, store, vi.fn().mockRejectedValue(new Error("planning failed")), vi.fn(), new AbortController().signal, { runOnce: true });
    expect(store.fail).toHaveBeenCalledWith("run-1", "worker-test", "planning failed");
  });

  it("does not claim new work after shutdown", async () => {
    const controller = new AbortController();
    controller.abort();
    const store = queue();
    await runGenerationWorker(config, store, vi.fn(), vi.fn(), controller.signal);
    expect(store.claim).not.toHaveBeenCalled();
  });
});
