import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AiProviderError, HermesAiProvider } from "../src/ai/hermes-provider.js";

const config = { command: "hermes", timeoutMs: 1234 };

describe("Hermes AI provider", () => {
  it("executes Hermes without a shell and validates structured output", async () => {
    const runner = vi.fn().mockResolvedValue({ stdout: "```json\n{\"answer\":\"verified\"}\n```", stderr: "" });
    const provider = new HermesAiProvider(config, runner);
    const result = await provider.generateStructured({ task: "test", instructions: ["Return JSON."], input: { safe: true } }, z.object({ answer: z.literal("verified") }));

    expect(result).toEqual({ provider: "hermes", value: { answer: "verified" } });
    expect(runner).toHaveBeenCalledWith("hermes", expect.arrayContaining(["--oneshot"]), { timeout: 1234 });
    expect(runner.mock.calls[0]?.[1].join(" ")).toContain('"safe":true');
  });

  it("returns stable errors without including provider stderr", async () => {
    const provider = new HermesAiProvider(config, vi.fn().mockRejectedValue(new Error("secret stderr")));
    await expect(provider.generateStructured({ task: "test", instructions: [], input: {} }, z.object({ ok: z.boolean() })))
      .rejects.toMatchObject({ code: "execution_failed", message: 'Failed to run AI provider "hermes"' } satisfies Partial<AiProviderError>);
  });

  it("rejects JSON that does not match the requested schema", async () => {
    const provider = new HermesAiProvider(config, vi.fn().mockResolvedValue({ stdout: '{"ok":"yes"}', stderr: "" }));
    await expect(provider.generateStructured({ task: "test", instructions: [], input: {} }, z.object({ ok: z.boolean() })))
      .rejects.toMatchObject({ code: "invalid_structure" } satisfies Partial<AiProviderError>);
  });
});
