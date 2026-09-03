import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { planDemo } from "../src/planner.js";

const plan = {
  objective: "Show the homepage",
  summary: "Open the homepage and confirm the heading.",
  assumptions: [],
  warnings: [],
  demo: {
    name: "homepage demo",
    viewport: { width: 1280, height: 720 },
    steps: [
      { action: "goto" as const, url: "https://example.com" },
      {
        action: "assertVisible" as const,
        target: { role: "heading", name: "Example Domain" }
      }
    ]
  }
};

describe("planDemo", () => {
  it("passes repository context to Hermes and saves its validated plan", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ai-demo-agent-"));
    const planner = { createDemoPlan: vi.fn().mockResolvedValue(plan) };

    const planPath = await planDemo({
      url: "https://example.com",
      objective: "Show the homepage",
      repositoryPath: process.cwd(),
      outputRoot: temporaryRoot
    }, planner);

    const savedPlan = JSON.parse(await readFile(planPath, "utf8"));
    expect(savedPlan).toEqual(plan);
    expect(path.basename(planPath)).toBe("demo-plan.json");
    expect(planner.createDemoPlan).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://example.com",
      objective: "Show the homepage",
      repository: expect.objectContaining({
        path: process.cwd(),
        readme: expect.stringContaining("AI Demo Agent")
      })
    }));
  });

  it("continues when the repository has no README", async () => {
    const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "ai-demo-agent-"));
    const emptyRepository = await mkdtemp(path.join(os.tmpdir(), "empty-repo-"));
    const planner = { createDemoPlan: vi.fn().mockResolvedValue(plan) };

    await planDemo({
      url: "https://example.com",
      objective: "Show the homepage",
      repositoryPath: emptyRepository,
      outputRoot: temporaryRoot
    }, planner);

    expect(planner.createDemoPlan).toHaveBeenCalledWith(expect.objectContaining({
      repository: { path: emptyRepository }
    }));
  });
});
