import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("automatic launch safety runbook", () => {
  it("documents credentials, immutable approval, stale-source checks, and partial failures", async () => {
    const docs = await readFile(new URL("docs/github-launch-publishing.md", root), "utf8");
    expect(docs).toContain("GITHUB_LAUNCH_TOKEN");
    expect(docs).toContain("Contents: read and write");
    expect(docs).toContain("Administration: read and write");
    expect(docs).toContain("source_changed");
    expect(docs).toContain("UNKNOWN");
    expect(docs).toContain("never publishes");
  });

  it("keeps editing, approval, and GitHub publishing as separate owner actions", async () => {
    const actions = await readFile(new URL("apps/web/src/app/actions.ts", root), "utf8");
    const publishing = await readFile(new URL("apps/web/src/data/launch-packages.ts", root), "utf8");
    expect(actions).toContain("saveLaunchPackageAction");
    expect(actions).toContain("approveLaunchPackageAction");
    expect(actions).toContain("publishLaunchPackageAction");
    const approval = actions.match(/export async function approveLaunchPackageAction[\s\S]*?\n\}/)?.[0];
    expect(approval).toBeDefined();
    expect(approval).not.toMatch(/publishApproved|fetch\(/);
    expect(publishing).toContain("approvedSnapshot");
    expect(publishing).toContain("approvedContentHash");
    expect(publishing).toContain("launchPackageId_approvalHash");
  });

  it("never places real launch credentials in versioned environment examples", async () => {
    const example = await readFile(new URL("apps/web/.env.example", root), "utf8");
    expect(example).toContain('GITHUB_LAUNCH_TOKEN=""');
    expect(example).toContain('OPENAI_API_KEY=""');
    expect(example).not.toMatch(/github_pat_[A-Za-z0-9_]+|ghp_[A-Za-z0-9]+/);
    expect(example).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  });
});
