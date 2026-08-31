import { describe, expect, it, vi } from "vitest";

import { createHermesPlanningProcessor } from "../apps/web/src/worker/processor.js";

const plan = {
  objective: "Show the homepage",
  summary: "Open the product and verify its heading.",
  assumptions: [],
  warnings: [],
  demo: {
    name: "homepage",
    steps: [
      { action: "goto" as const, url: "https://example.com" },
      { action: "assertVisible" as const, target: { role: "heading", name: "Example Domain" } },
    ],
  },
};

function run() {
  return {
    id: "run-1",
    projectId: "project-1",
    objective: "Show the homepage",
    status: "ANALYZING" as const,
    plan: null,
    error: null,
    attemptCount: 1,
    maxAttempts: 3,
    workerId: "worker-1",
    leaseExpiresAt: new Date(),
    lastHeartbeatAt: new Date(),
    nextAttemptAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: {
      id: "project-1",
      name: "Example",
      productUrl: "https://example.com",
      repositoryUrl: "https://github.com/example/product",
      isOpenSource: true,
    },
  };
}

describe("Hermes generation processor", () => {
  it("plans from persisted project context and saves the validated result", async () => {
    const planner = { createDemoPlan: vi.fn().mockResolvedValue(plan) };
    const store = { markPlanning: vi.fn().mockResolvedValue(true), savePlan: vi.fn().mockResolvedValue(true) };
    await createHermesPlanningProcessor(planner, store)(run(), { workerId: "worker-1", signal: new AbortController().signal });

    expect(planner.createDemoPlan).toHaveBeenCalledWith({
      url: "https://example.com",
      objective: "Show the homepage",
      repository: { url: "https://github.com/example/product" },
    });
    expect(store.savePlan).toHaveBeenCalledWith(
      "run-1",
      "worker-1",
      expect.objectContaining({ objective: plan.objective, summary: plan.summary }),
    );
  });

  it("rejects invalid Hermes output before persistence", async () => {
    const planner = { createDemoPlan: vi.fn().mockResolvedValue({ objective: "incomplete" }) };
    const store = { markPlanning: vi.fn().mockResolvedValue(true), savePlan: vi.fn() };
    await expect(createHermesPlanningProcessor(planner as never, store)(run(), { workerId: "worker-1", signal: new AbortController().signal })).rejects.toThrow();
    expect(store.savePlan).not.toHaveBeenCalled();
  });

  it("stops when worker ownership is lost", async () => {
    const planner = { createDemoPlan: vi.fn() };
    const store = { markPlanning: vi.fn().mockResolvedValue(false), savePlan: vi.fn() };
    await expect(createHermesPlanningProcessor(planner, store)(run(), { workerId: "worker-1", signal: new AbortController().signal })).rejects.toThrow(/lease was lost/);
    expect(planner.createDemoPlan).not.toHaveBeenCalled();
  });
});
