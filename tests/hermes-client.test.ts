import { describe, expect, it, vi } from "vitest";
import { HermesClient, HermesClientError, buildHermesPlanningPrompt } from "../src/hermes/client.js";

const validPlan = {
  objective: "Show the homepage",
  summary: "Open the homepage and confirm the heading.",
  assumptions: [],
  warnings: [],
  demo: {
    name: "homepage",
    steps: [
      { action: "goto", url: "https://example.com" },
      { action: "assertVisible", target: { role: "heading", name: "Example Domain" } }
    ]
  }
};

describe("HermesClient", () => {
  it("calls Hermes without shell interpolation and validates its plan", async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: JSON.stringify(validPlan), stderr: "" });
    const client = new HermesClient({
      command: "/opt/hermes",
      model: "gpt-model",
      provider: "openai-codex",
      timeoutMs: 30_000
    }, runner);

    const plan = await client.createDemoPlan({
      url: "https://example.com",
      objective: "Show the homepage"
    });

    expect(plan.demo.name).toBe("homepage");
    expect(runner).toHaveBeenCalledOnce();
    expect(runner.mock.calls[0]?.[0]).toBe("/opt/hermes");
    expect(runner.mock.calls[0]?.[1]).toEqual(expect.arrayContaining([
      "--oneshot", "--model", "gpt-model", "--provider", "openai-codex"
    ]));
    expect(runner.mock.calls[0]?.[2]).toEqual({ timeout: 30_000 });
  });

  it("accepts a JSON response inside a code fence", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: `\`\`\`json\n${JSON.stringify(validPlan)}\n\`\`\``,
      stderr: ""
    });
    const client = new HermesClient({ command: "hermes", timeoutMs: 120_000 }, runner);

    await expect(client.createDemoPlan({
      url: "https://example.com",
      objective: "Show the homepage"
    })).resolves.toMatchObject({ objective: "Show the homepage" });
  });

  it("rejects malformed JSON", async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: "not-json", stderr: "" });
    const client = new HermesClient({ command: "hermes", timeoutMs: 120_000 }, runner);

    await expect(client.createDemoPlan({
      url: "https://example.com",
      objective: "Show the homepage"
    })).rejects.toThrow("O Hermes não retornou um JSON válido");
  });

  it("rejects a partial plan before Playwright can receive it", async () => {
    const runner = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({ objective: "Incomplete" }),
      stderr: ""
    });
    const client = new HermesClient({ command: "hermes", timeoutMs: 120_000 }, runner);

    await expect(client.createDemoPlan({
      url: "https://example.com",
      objective: "Show the homepage"
    })).rejects.toThrow("não segue o contrato esperado");
  });

  it("wraps process failures with an actionable error", async () => {
    const runner = vi.fn().mockRejectedValue(new Error("timed out"));
    const client = new HermesClient({ command: "hermes", timeoutMs: 1_000 }, runner);

    await expect(client.createDemoPlan({
      url: "https://example.com",
      objective: "Show the homepage"
    })).rejects.toBeInstanceOf(HermesClientError);
  });
});

describe("buildHermesPlanningPrompt", () => {
  it("includes the objective and factuality rule", () => {
    const prompt = buildHermesPlanningPrompt({
      url: "https://example.com",
      objective: "Show the homepage"
    });

    expect(prompt).toContain("Show the homepage");
    expect(prompt).toContain("Do not invent features");
    expect(prompt).toContain("assertVisible");
  });

  it("builds a native accessibility plan for desktop projects", () => {
    const prompt = buildHermesPlanningPrompt({
      kind: "DESKTOP",
      url: "https://github.com/example/product",
      objective: "Show the native dashboard",
      desktop: { projectPath: "/srv/product", launchCommand: "./bin/product" },
    });

    expect(prompt).toContain("native desktop product demo");
    expect(prompt).toContain("Do not use goto");
    expect(prompt).toContain("accessibility role/name");
  });
});
