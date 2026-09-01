import { describe, expect, it, vi } from "vitest";

import { createSocialDraftingProcessor } from "../apps/web/src/worker/processor.js";

const plan = {
  objective: "Show review",
  summary: "Verify the review page.",
  assumptions: [],
  warnings: [],
  demo: {
    name: "review",
    viewport: { width: 1280, height: 720 },
    steps: [
      { action: "goto" as const, url: "https://demo.example" },
      { action: "assertVisible" as const, target: { role: "heading", name: "Review" } },
    ],
  },
};

const run = {
  id: "run-1",
  projectId: "project-1",
  objective: plan.objective,
  status: "DRAFTING" as const,
  plan,
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
  project: { id: "project-1", name: "Demo", productUrl: "https://demo.example", repositoryUrl: null, isOpenSource: false },
};

const artifacts = {
  videoPath: "/output/review/demo.webm",
  reportPath: "/output/review/execution-report.json",
  report: {
    demoName: "review",
    status: "passed" as const,
    startedAt: "2026-08-31T00:00:00.000Z",
    finishedAt: "2026-08-31T00:01:00.000Z",
    videoPath: "/output/review/demo.webm",
    steps: [
      { index: 1, action: "goto" as const, status: "passed" as const, durationMs: 10 },
      { index: 2, action: "assertVisible" as const, status: "passed" as const, durationMs: 10, evidencePath: "evidence/step-2.png" },
    ],
  },
};

const bundle = {
  x: { platform: "X" as const, language: "en" as const, content: "Review verified.", claimIds: ["claim-2"], mentions: [] },
  linkedin: { platform: "LINKEDIN" as const, language: "en" as const, content: "The review workflow was verified.", claimIds: ["claim-2"], mentions: [] },
};

describe("social drafting worker", () => {
  it("gives Hermes verified evidence and persists both drafts", async () => {
    const generator = { createDrafts: vi.fn().mockResolvedValue(bundle) };
    const store = vi.fn().mockResolvedValue(true);
    await createSocialDraftingProcessor(generator, store, "/output")(
      run,
      { workerId: "worker-1", signal: new AbortController().signal },
      artifacts,
    );
    const context = generator.createDrafts.mock.calls[0]?.[0];
    expect(context.verifiedClaims).toEqual([expect.objectContaining({ id: "claim-2", evidenceStorageKey: "review/evidence/step-2.png" })]);
    expect(context.mentionCandidates).toEqual([]);
    expect(store).toHaveBeenCalledWith("run-1", "worker-1", bundle, context);
  });

  it("does not draft from a failed browser report", async () => {
    const generator = { createDrafts: vi.fn() };
    await expect(createSocialDraftingProcessor(generator, vi.fn(), "/output")(
      run,
      { workerId: "worker-1", signal: new AbortController().signal },
      { ...artifacts, report: { ...artifacts.report, status: "failed" as const } },
    )).rejects.toThrow(/passed evidence-backed/);
    expect(generator.createDrafts).not.toHaveBeenCalled();
  });
});
