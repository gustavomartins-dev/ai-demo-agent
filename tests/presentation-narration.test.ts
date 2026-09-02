import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { buildNarrationScript, loadNarrationConfig, synthesizeNarration } from "../src/presentation/narration.js";

describe("presentation narration", () => {
  it("keeps the voice credential separate from Hermes", () => {
    expect(loadNarrationConfig({})).toBeNull();
    expect(loadNarrationConfig({ OPENAI_API_KEY: "secret" })).toMatchObject({ model: "gpt-4o-mini-tts", voice: "marin" });
  });

  it("frames the project as engineering work rather than a sales pitch", () => {
    const script = buildNarrationScript("solve hydration timing", "the plan and progress workflow");
    expect(script).toContain("the plan and progress workflow");
    expect(script).toContain("implementation working end to end");
    expect(script).not.toMatch(/buy|customer|try it now/i);
  });

  it("requests WAV speech without exposing the key in errors", async () => {
    const target = path.join(os.tmpdir(), `narration-${crypto.randomUUID()}.wav`);
    const fetcher = vi.fn().mockResolvedValue(new Response(Buffer.from("wave-data"), { status: 200 }));
    await synthesizeNarration("Hello", target, { apiKey: "secret", model: "model", voice: "voice" }, fetcher);
    expect(await readFile(target, "utf8")).toBe("wave-data");
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({ Authorization: "Bearer secret" });
    expect(request.body).toContain('"response_format":"wav"');
    await rm(target, { force: true });
  });
});
