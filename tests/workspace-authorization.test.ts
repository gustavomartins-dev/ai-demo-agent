import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const projectsPath = new URL("../apps/web/src/data/projects.ts", import.meta.url);
const actionsPath = new URL("../apps/web/src/app/actions.ts", import.meta.url);

describe("workspace authorization boundaries", () => {
  it("scopes dashboard and project reads to the authenticated owner ID", async () => {
    const source = await readFile(projectsPath, "utf8");
    expect(source).toContain("getDashboardData(ownerId: string)");
    expect(source).toContain("where: { ownerId }");
    expect(source).toContain("where: { id: projectId, ownerId }");
  });

  it("checks the session again inside the project creation action", async () => {
    const source = await readFile(actionsPath, "utf8");
    expect(source).toContain("const session = await auth()");
    expect(source).toContain("if (!session?.user?.id)");
    expect(source).toContain("createProject(session.user.id");
  });
});
