import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const runbookPath = new URL("../docs/workspace-authentication.md", import.meta.url);
const workflowPath = new URL("../.github/workflows/quality.yml", import.meta.url);

describe("workspace authentication operations", () => {
  it("documents every required credential and the exact GitHub callback", async () => {
    const runbook = await readFile(runbookPath, "utf8");
    for (const variable of ["DATABASE_URL", "AUTH_SECRET", "AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET", "APP_OWNER_GITHUB_LOGIN"]) {
      expect(runbook).toContain(variable);
    }
    expect(runbook).toContain("/api/auth/callback/github");
    expect(runbook).toContain("npm run db:deploy");
  });

  it("applies migrations against PostgreSQL in CI", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    expect(workflow).toContain("postgres:17-alpine");
    expect(workflow).toContain("npm run db:deploy");
  });
});
