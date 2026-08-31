import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const runbookPath = new URL("../docs/social-publishing.md", import.meta.url);

describe("safe publishing runbook", () => {
  it("documents setup, safety, incidents, costs, manual verification, and rollback", async () => {
    const runbook = await readFile(runbookPath, "utf8");
    for (const section of ["## Safety and idempotency", "## Automated release gate", "## Manual sandbox checklist", "## Failure and incident response", "## Cost and rate limits", "## Rollback"]) {
      expect(runbook).toContain(section);
    }
    const normalized = runbook.replaceAll(/\s+/g, " ");
    expect(normalized).toContain("Never delete an `UNKNOWN` attempt");
    expect(normalized).toContain("never response bodies, access tokens, refresh tokens");
  });

  it("keeps publishing code free of secret-bearing logs", async () => {
    const data = await readFile(new URL("../apps/web/src/data/social-publishing.ts", import.meta.url), "utf8");
    const provider = await readFile(new URL("../apps/web/src/lib/social-publishing/provider.ts", import.meta.url), "utf8");
    expect(`${data}\n${provider}`).not.toMatch(/console\.|response\.text\(|response\.body/);
  });
});
