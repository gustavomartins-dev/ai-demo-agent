import { describe, expect, it, vi } from "vitest";
import {
  executeApprovedPlan,
  formatDemoPlan,
  isExplicitApproval
} from "../src/approval.js";

const plan = {
  objective: "Show the homepage",
  summary: "Open the homepage and confirm the heading.",
  assumptions: [],
  warnings: ["Uses public demo data"],
  demo: {
    name: "homepage",
    viewport: { width: 1280, height: 720 },
    steps: [
      { action: "goto" as const, url: "https://example.com", title: "Open the product" },
      {
        action: "assertVisible" as const,
        target: { role: "heading", name: "Example Domain" },
        title: "Confirm the result"
      }
    ]
  }
};

describe("plan approval", () => {
  it("accepts only explicit Portuguese approval", () => {
    expect(isExplicitApproval("sim")).toBe(true);
    expect(isExplicitApproval(" S ")).toBe(true);
    expect(isExplicitApproval("")).toBe(false);
    expect(isExplicitApproval("yes")).toBe(false);
  });

  it("shows the objective, warnings and steps before recording", () => {
    const review = formatDemoPlan(plan);
    expect(review).toContain("Objetivo: Show the homepage");
    expect(review).toContain("Uses public demo data");
    expect(review).toContain("1. Open the product");
    expect(review).toContain("2. Confirm the result");
  });

  it("does not call Playwright when approval is denied", async () => {
    const executor = vi.fn();
    await expect(executeApprovedPlan(plan, false, executor)).resolves.toEqual({
      status: "cancelled"
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("sends only the validated demo to Playwright after approval", async () => {
    const executor = vi.fn().mockResolvedValue("/tmp/demo.webm");
    await expect(executeApprovedPlan(plan, true, executor, "videos")).resolves.toEqual({
      status: "completed",
      videoPath: "/tmp/demo.webm"
    });
    expect(executor).toHaveBeenCalledWith(plan.demo, "videos");
  });

  it("blocks a plan that was changed into an invalid shape", async () => {
    const executor = vi.fn();
    const invalidPlan = { ...plan, demo: { ...plan.demo, steps: [] } };
    await expect(executeApprovedPlan(invalidPlan, true, executor)).rejects.toThrow();
    expect(executor).not.toHaveBeenCalled();
  });
});
