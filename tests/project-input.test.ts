import { describe, expect, it } from "vitest";
import { projectInputSchema } from "../apps/web/src/lib/project-input.js";

describe("project creation input", () => {
  it("accepts a complete English launch request", () => {
    expect(projectInputSchema.parse({
      name: "AI Demo Agent",
      kind: "WEB",
      productUrl: "https://demo.example.com",
      repositoryUrl: "https://github.com/example/demo",
      localPath: "",
      launchCommand: "",
      objective: "Show how a project becomes an approved social launch.",
      isOpenSource: true,
    })).toMatchObject({ name: "AI Demo Agent", isOpenSource: true });
  });

  it("accepts a private project without repository URL", () => {
    expect(projectInputSchema.parse({
      name: "Private app",
      kind: "WEB",
      productUrl: "https://private.example.com",
      repositoryUrl: "",
      localPath: "",
      launchCommand: "",
      objective: "Present the primary workflow to potential customers.",
      isOpenSource: false,
    }).repositoryUrl).toBe("");
  });

  it("rejects invalid URLs and vague objectives", () => {
    expect(() => projectInputSchema.parse({
      name: "Demo",
      kind: "WEB",
      productUrl: "not-a-url",
      repositoryUrl: "also-not-a-url",
      localPath: "",
      launchCommand: "",
      objective: "Show it",
      isOpenSource: true,
    })).toThrow();
  });

  it("requires an absolute project path and launch command for desktop apps", () => {
    expect(projectInputSchema.parse({
      name: "Water Reminder",
      kind: "DESKTOP",
      productUrl: "https://github.com/example/water-reminder",
      repositoryUrl: "https://github.com/example/water-reminder",
      localPath: "/home/example/water-reminder",
      launchCommand: ".venv/bin/water-reminder",
      objective: "Demonstrate the native hydration reminder workflow.",
      isOpenSource: true,
    }).kind).toBe("DESKTOP");

    expect(() => projectInputSchema.parse({
      name: "Unsafe desktop",
      kind: "DESKTOP",
      productUrl: "https://example.com",
      repositoryUrl: "",
      localPath: "relative/path",
      launchCommand: "",
      objective: "Demonstrate a desktop application safely.",
      isOpenSource: false,
    })).toThrow();
  });
});
