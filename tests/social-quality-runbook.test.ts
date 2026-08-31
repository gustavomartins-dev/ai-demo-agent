import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const runbookPath = new URL("../docs/social-draft-quality.md", import.meta.url);

describe("social draft quality runbook", () => {
  it("documents quality gates, settings, cost measurement, failures, and reruns", async () => {
    const runbook = await readFile(runbookPath, "utf8");
    for (const section of ["## Quality gates", "## Generation settings", "## Failure diagnosis", "## Reruns and cost control", "## Release evidence"]) {
      expect(runbook).toContain(section);
    }
    expect(runbook).toContain("provider's usage dashboard");
    expect(runbook).toContain("returns the run to `DRAFTING`");
  });
});
