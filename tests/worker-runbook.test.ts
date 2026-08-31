import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const runbookPath = new URL("../docs/generation-worker.md", import.meta.url);
const cliPath = new URL("../apps/web/src/worker/cli.ts", import.meta.url);

describe("generation worker operations", () => {
  it("documents startup, recovery, storage, and graceful shutdown", async () => {
    const runbook = await readFile(runbookPath, "utf8");
    for (const requirement of ["npm run worker", "AI_DEMO_OUTPUT_ROOT", "SIGTERM", "Retry generation", "READY_FOR_REVIEW"]) {
      expect(runbook).toContain(requirement);
    }
  });

  it("loads the standalone worker environment before database initialization", async () => {
    const source = await readFile(cliPath, "utf8");
    expect(source.trimStart().startsWith('import "dotenv/config"')).toBe(true);
  });
});
