import { describe, expect, it } from "vitest";
import { loadHermesConfig } from "../src/hermes/config.js";
import { hermesDemoPlanSchema, hermesPlanningRequestSchema } from "../src/hermes/contract.js";

describe("Hermes integration contract", () => {
  it("accepts the input needed to plan a demo", () => {
    const request = hermesPlanningRequestSchema.parse({
      url: "https://example.com",
      objective: "Show the main workflow",
      repository: { path: ".", readme: "# Example" }
    });

    expect(request.objective).toBe("Show the main workflow");
  });

  it("requires an executable and valid demo in the response", () => {
    const plan = hermesDemoPlanSchema.parse({
      objective: "Show the homepage",
      summary: "Open the product and confirm its main heading.",
      demo: {
        name: "homepage",
        steps: [
          { action: "goto", url: "https://example.com" },
          { action: "assertVisible", target: { role: "heading", name: "Example Domain" } }
        ]
      }
    });

    expect(plan.demo.steps).toHaveLength(2);
    expect(plan.assumptions).toEqual([]);
  });

  it("rejects a plan without a summary", () => {
    expect(() => hermesDemoPlanSchema.parse({
      objective: "Show the homepage",
      demo: { name: "homepage", steps: [{ action: "wait", milliseconds: 100 }] }
    })).toThrow();
  });

  it("accepts a remote repository URL as worker context", () => {
    const request = hermesPlanningRequestSchema.parse({
      url: "https://product.example.com",
      objective: "Show the main workflow",
      repository: { url: "https://github.com/example/product" },
    });
    expect(request.repository?.url).toBe("https://github.com/example/product");
  });
});

describe("Hermes configuration", () => {
  it("uses safe defaults for a local Hermes installation", () => {
    expect(loadHermesConfig({})).toEqual({ command: "hermes", timeoutMs: 120_000 });
  });

  it("loads explicit model, provider and timeout overrides", () => {
    expect(loadHermesConfig({
      AI_DEMO_HERMES_COMMAND: "/usr/local/bin/hermes",
      AI_DEMO_HERMES_MODEL: "gpt-model",
      AI_DEMO_HERMES_PROVIDER: "openai-codex",
      AI_DEMO_HERMES_TIMEOUT_MS: "30000"
    })).toEqual({
      command: "/usr/local/bin/hermes",
      model: "gpt-model",
      provider: "openai-codex",
      timeoutMs: 30_000
    });
  });

  it("rejects an invalid timeout", () => {
    expect(() => loadHermesConfig({ AI_DEMO_HERMES_TIMEOUT_MS: "fast" })).toThrow();
  });
});
