import { describe, expect, it } from "vitest";

import { createVerifiedSocialContext } from "../src/social/context.js";
import { validateDraftBundleAgainstContext } from "../src/social/contract.js";

const plan = {
  objective: "Show the product",
  summary: "Open the product and verify the launch dashboard.",
  assumptions: [],
  warnings: [],
  demo: {
    name: "launch-dashboard",
    viewport: { width: 1280, height: 720 },
    steps: [
      { action: "goto" as const, url: "https://product.example" },
      { action: "assertVisible" as const, target: { role: "heading", name: "Launch dashboard" } },
      { action: "assertVisible" as const, target: { text: "Unverified feature" } },
    ],
  },
};

const report = {
  demoName: "launch-dashboard",
  status: "passed" as const,
  startedAt: "2026-08-31T00:00:00.000Z",
  finishedAt: "2026-08-31T00:01:00.000Z",
  videoPath: "/output/demo.webm",
  steps: [
    { index: 1, action: "goto" as const, status: "passed" as const, durationMs: 10 },
    { index: 2, action: "assertVisible" as const, status: "passed" as const, durationMs: 10, evidencePath: "evidence/step-2.png" },
    { index: 3, action: "assertVisible" as const, status: "failed" as const, durationMs: 10 },
  ],
};

const context = createVerifiedSocialContext({
  project: {
    name: "AI Demo Agent",
    productUrl: "https://product.example",
    repositoryUrl: "https://github.com/example/ai-demo-agent",
    isOpenSource: true,
  },
  objective: plan.objective,
  plan,
  report,
  evidenceKeysByStep: { 2: "run/evidence/step-2.png" },
  mentionCandidates: [{
    platform: "X",
    identity: "@verified_builder",
    displayName: "Verified Builder",
    reason: "Repository contributor",
    sourceUrl: "https://github.com/verified_builder",
  }],
});

const validBundle = {
  x: {
    platform: "X",
    language: "en",
    content: "A verified launch dashboard, recorded with browser evidence. https://github.com/example/ai-demo-agent",
    claimIds: ["claim-2"],
    mentions: [{ identity: "@verified_builder", reason: "Repository contributor" }],
  },
  linkedin: {
    platform: "LINKEDIN",
    language: "en",
    content: "I built a launch dashboard and verified it through a reproducible browser run. https://github.com/example/ai-demo-agent",
    claimIds: ["claim-2"],
    mentions: [],
  },
};

describe("verified social context", () => {
  it("creates claims only from passed assertions with evidence", () => {
    expect(context.verifiedClaims).toEqual([expect.objectContaining({ id: "claim-2", stepIndex: 2 })]);
    expect(context.verifiedClaims[0]?.statement).toContain("Launch dashboard");
  });

  it("rejects a failed execution report", () => {
    expect(() => createVerifiedSocialContext({
      ...({ project: context.project, objective: plan.objective, plan, report, evidenceKeysByStep: { 2: "evidence.png" } }),
      report: { ...report, status: "failed" },
    })).toThrow(/passed evidence-backed/);
  });
});

describe("platform draft contracts", () => {
  it("accepts English platform-specific drafts grounded in known claims", () => {
    expect(validateDraftBundleAgainstContext(validBundle, context).x.platform).toBe("X");
  });

  it("rejects unsupported claims and mentions", () => {
    expect(() => validateDraftBundleAgainstContext({
      ...validBundle,
      x: { ...validBundle.x, claimIds: ["claim-999"] },
    }, context)).toThrow(/unsupported claim/);
    expect(() => validateDraftBundleAgainstContext({
      ...validBundle,
      x: { ...validBundle.x, mentions: [{ identity: "@invented", reason: "Looks relevant" }] },
    }, context)).toThrow(/unsupported mention/);
  });

  it("requires the repository link for open-source launches", () => {
    expect(() => validateDraftBundleAgainstContext({
      ...validBundle,
      linkedin: { ...validBundle.linkedin, content: "A verified product launch." },
    }, context)).toThrow(/repository URL/);
  });
});
