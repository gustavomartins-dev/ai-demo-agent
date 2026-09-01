import { describe, expect, it, vi } from "vitest";

import { buildSocialDraftPrompt, HermesSocialClient, HermesSocialClientError } from "../src/social/hermes-client.js";

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
  mentionCandidates: [],
};

const bundle = {
  x: {
    platform: "X",
    language: "en",
    content: "I built a verified review workflow to keep approval explicit. https://github.com/example/ai-demo-agent",
    claimIds: ["claim-2"],
    mentions: [],
  },
  linkedin: {
    platform: "LINKEDIN",
    language: "en",
    content: "I built and verified a review workflow. https://github.com/example/ai-demo-agent",
    claimIds: ["claim-2"],
    mentions: [],
  },
};

describe("Hermes social client", () => {
  it("asks for English, evidence-grounded platform drafts", () => {
    const prompt = buildSocialDraftPrompt(context);
    expect(prompt).toContain("Write both posts in English");
    expect(prompt).toContain("Use only verifiedClaims");
    expect(prompt).toContain("at most 280 characters");
    expect(prompt).toContain("what I built, why I built it");
    expect(prompt).toContain("not to sell the product");
  });

  it("runs Hermes without a shell and validates its result", async () => {
    const run = vi.fn().mockResolvedValue({ stdout: JSON.stringify(bundle), stderr: "" });
    const client = new HermesSocialClient({ command: "hermes", model: "gpt-test", timeoutMs: 2_000 }, run);
    await expect(client.createDrafts(context)).resolves.toEqual(bundle);
    expect(run).toHaveBeenCalledWith("hermes", expect.arrayContaining(["--oneshot", "--model", "gpt-test"]), { timeout: 2_000 });
  });

  it("rejects claims that Playwright did not verify", async () => {
    const invalid = { ...bundle, x: { ...bundle.x, claimIds: ["claim-999"] } };
    const client = new HermesSocialClient(
      { command: "hermes", timeoutMs: 2_000 },
      vi.fn().mockResolvedValue({ stdout: JSON.stringify(invalid), stderr: "" }),
    );
    await expect(client.createDrafts(context)).rejects.toBeInstanceOf(HermesSocialClientError);
  });

  it("rejects Portuguese content mislabeled as English", async () => {
    const invalid = {
      ...bundle,
      x: { ...bundle.x, content: "Este projeto foi feito para mostrar como funciona. https://github.com/example/ai-demo-agent" },
    };
    const client = new HermesSocialClient(
      { command: "hermes", timeoutMs: 2_000 },
      vi.fn().mockResolvedValue({ stdout: JSON.stringify(invalid), stderr: "" }),
    );
    await expect(client.createDrafts(context)).rejects.toThrow(/english_only/);
  });
});
