import { describe, expect, it, vi } from "vitest";

import { createPlaywrightRecordingProcessor } from "../apps/web/src/worker/processor.js";
import { DemoRunError } from "../src/runner.js";

const plan = {
  objective: "Show the homepage",
  summary: "Open and verify the homepage.",
  assumptions: [],
  warnings: [],
  demo: {
    name: "homepage",
    viewport: { width: 1280, height: 720 },
    steps: [{ action: "goto" as const, url: "https://example.com" }],
  },
};

function recordingRun() {
  return {
    id: "run-1",
    projectId: "project-1",
    objective: plan.objective,
    status: "RECORDING" as const,
    plan,
    error: null,
    attemptCount: 2,
    maxAttempts: 3,
    workerId: "worker-1",
    leaseExpiresAt: new Date(),
    lastHeartbeatAt: new Date(),
    nextAttemptAt: new Date(),
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    project: { id: "project-1", name: "Example", productUrl: "https://example.com", repositoryUrl: null, isOpenSource: false },
  };
}

const passedArtifacts = {
  videoPath: "/output/demo/demo.webm",
  reportPath: "/output/demo/execution-report.json",
  report: {
    demoName: "homepage",
    status: "passed" as const,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    videoPath: "/output/demo/demo.webm",
    steps: [],
  },
};

describe("Playwright generation processor", () => {
  it("records the persisted plan, registers artifacts, and starts drafting", async () => {
    const recorder = vi.fn().mockResolvedValue(passedArtifacts);
    const store = vi.fn().mockResolvedValue(true);
    const draft = vi.fn();
    const run = recordingRun();
    await createPlaywrightRecordingProcessor(recorder, store, "/output", draft)(
      run,
      { workerId: "worker-1", signal: new AbortController().signal },
    );
    expect(recorder).toHaveBeenCalledWith(plan.demo, "/output");
    expect(store).toHaveBeenCalledWith("run-1", "worker-1", passedArtifacts, "/output", true);
    expect(draft).toHaveBeenCalledWith(run, expect.objectContaining({ workerId: "worker-1" }), passedArtifacts);
  });

  it("registers failure evidence before propagating the browser error", async () => {
    const failureArtifacts = { ...passedArtifacts, videoPath: null, report: { ...passedArtifacts.report, status: "failed" as const } };
    const recorder = vi.fn().mockRejectedValue(new DemoRunError("browser failed", failureArtifacts));
    const store = vi.fn().mockResolvedValue(true);
    await expect(createPlaywrightRecordingProcessor(recorder, store, "/output")(
      recordingRun(),
      { workerId: "worker-1", signal: new AbortController().signal },
    )).rejects.toThrow("browser failed");
    expect(store).toHaveBeenCalledWith("run-1", "worker-1", failureArtifacts, "/output", false);
  });

  it("rejects an invalid persisted plan before opening a browser", async () => {
    const recorder = vi.fn();
    const store = vi.fn();
    await expect(createPlaywrightRecordingProcessor(recorder, store, "/output")(
      { ...recordingRun(), plan: { objective: "incomplete" } } as never,
      { workerId: "worker-1", signal: new AbortController().signal },
    )).rejects.toThrow();
    expect(recorder).not.toHaveBeenCalled();
  });
});
