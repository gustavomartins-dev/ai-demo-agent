import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const projectsPath = new URL("../apps/web/src/data/projects.ts", import.meta.url);
const actionsPath = new URL("../apps/web/src/app/actions.ts", import.meta.url);
const projectsPathForRetry = new URL("../apps/web/src/data/projects.ts", import.meta.url);

describe("workspace authorization boundaries", () => {
  it("scopes dashboard and project reads to the authenticated owner ID", async () => {
    const source = await readFile(projectsPath, "utf8");
    expect(source).toContain("getDashboardData(ownerId: string)");
    expect(source).toContain("where: { ownerId }");
    expect(source).toContain("where: { id: projectId, ownerId }");
  });

  it("authorizes manual retries by owner and failed status", async () => {
    const actions = await readFile(actionsPath, "utf8");
    const projects = await readFile(projectsPathForRetry, "utf8");
    expect(actions).toContain("retryFailedGenerationRun(session.user.id");
    expect(projects).toContain('where: { id: runId, status: "FAILED", project: { ownerId } }');
    expect(projects).toContain('status: run.plan ? "PLANNED" : "QUEUED"');
  });

  it("checks the session again inside the project creation action", async () => {
    const source = await readFile(actionsPath, "utf8");
    expect(source).toContain("const session = await auth()");
    expect(source).toContain("if (!session?.user?.id)");
    expect(source).toContain("createProject(session.user.id");
  });
});
