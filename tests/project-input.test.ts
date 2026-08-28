import { describe, expect, it } from "vitest";
import { projectInputSchema } from "../apps/web/src/lib/project-input.js";

describe("project creation input", () => {
  it("accepts a complete English launch request", () => {
    expect(projectInputSchema.parse({
      name: "AI Demo Agent",
      productUrl: "https://demo.example.com",
      repositoryUrl: "https://github.com/example/demo",
      objective: "Show how a project becomes an approved social launch.",
      isOpenSource: true,
    })).toMatchObject({ name: "AI Demo Agent", isOpenSource: true });
  });

  it("accepts a private project without repository URL", () => {
    expect(projectInputSchema.parse({
      name: "Private app",
      productUrl: "https://private.example.com",
      repositoryUrl: "",
      objective: "Present the primary workflow to potential customers.",
      isOpenSource: false,
    }).repositoryUrl).toBe("");
  });

  it("rejects invalid URLs and vague objectives", () => {
    expect(() => projectInputSchema.parse({
      name: "Demo",
      productUrl: "not-a-url",
      repositoryUrl: "also-not-a-url",
      objective: "Show it",
      isOpenSource: true,
    })).toThrow();
  });
});
