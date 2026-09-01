import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { evaluateSocialDraftBundle } from "../src/social/evals.js";

const context = {
  project: {
    name: "AI Demo Agent",
    productUrl: "https://demo.example",
    repositoryUrl: "https://github.com/example/ai-demo-agent",
    isOpenSource: true,
  },
  objective: "Show the review workflow",
  demoSummary: "Verify the review screen.",
  verifiedClaims: [{ id: "claim-2", statement: "Visible heading: Review", stepIndex: 2, evidenceStorageKey: "run/evidence/step-2.png" }],
  mentionCandidates: [{ platform: "X", identity: "@builder", displayName: "Builder", reason: "Repository contributor", sourceUrl: "https://github.com/builder" }],
};

async function fixture(name: string): Promise<unknown> {
  return JSON.parse(await readFile(new URL(`fixtures/social-drafts/${name}.json`, import.meta.url), "utf8"));
}

describe("social draft quality evals", () => {
  it("passes a grounded English platform bundle", async () => {
    const result = evaluateSocialDraftBundle(await fixture("success"), context);
    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(6);
  });

  it("detects content mislabeled as English", async () => {
    const result = evaluateSocialDraftBundle(await fixture("adversarial-portuguese"), context);
    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.name === "english_only")?.passed).toBe(false);
  });

  it("detects hallucinated claims and unsupported mentions", async () => {
    const result = evaluateSocialDraftBundle(await fixture("adversarial-hallucination"), context);
    expect(result.passed).toBe(false);
    expect(result.checks.find((check) => check.name === "grounded_claims")?.passed).toBe(false);
    expect(result.checks.find((check) => check.name === "supported_mentions")?.passed).toBe(false);
  });

  it("uses the schema check for platform length violations", async () => {
    const valid = await fixture("success") as { x: { content: string } };
    valid.x.content = "x".repeat(281);
    const result = evaluateSocialDraftBundle(valid, context);
    expect(result.checks).toEqual([expect.objectContaining({ name: "schema", passed: false })]);
  });
});
