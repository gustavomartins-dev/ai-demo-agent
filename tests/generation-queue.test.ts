import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const queuePath = new URL("../apps/web/src/data/generation-queue.ts", import.meta.url);

describe("generation queue contract", () => {
  it("uses exponential retry delays without delaying the first claim", async () => {
    const { retryDelayMs } = await import("../apps/web/src/lib/generation-queue-policy.js");
    expect(retryDelayMs(1)).toBe(30_000);
    expect(retryDelayMs(2)).toBe(60_000);
    expect(retryDelayMs(3)).toBe(120_000);
  });

  it("claims work through a locked, skip-locked PostgreSQL update", async () => {
    const source = await readFile(queuePath, "utf8");
    expect(source).toContain("FOR UPDATE SKIP LOCKED");
    expect(source).toContain('"attemptCount" < "maxAttempts"');
    expect(source).toContain('"leaseExpiresAt" <');
    expect(source).toContain("candidate.\"status\" = 'PLANNED'");
    expect(source).toContain("'RECORDING'::\"RunStatus\"");
    expect(source).toContain("Worker lease expired after the maximum number of attempts.");
  });
});
