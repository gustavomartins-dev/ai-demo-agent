import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { socialContentHash } from "../apps/web/src/lib/social-approval.js";

const draftsPath = new URL("../apps/web/src/data/social-drafts.ts", import.meta.url);
const projectsPath = new URL("../apps/web/src/data/projects.ts", import.meta.url);
const actionsPath = new URL("../apps/web/src/app/actions.ts", import.meta.url);

describe("explicit social draft approval", () => {
  it("binds the immutable hash to platform and exact content", () => {
    const content = "A verified launch.";
    expect(socialContentHash("X", content)).toHaveLength(64);
    expect(socialContentHash("X", content)).not.toBe(socialContentHash("LINKEDIN", content));
    expect(socialContentHash("X", content)).not.toBe(socialContentHash("X", `${content} `));
  });

  it("requires owner, matching connected account, credential, and evidence", async () => {
    const source = await readFile(draftsPath, "utf8");
    expect(source).toContain("generationRun: { project: { ownerId } }");
    expect(source).toContain('status: "CONNECTED"');
    expect(source).toContain("authorizationExpiresAt: { gt: now }");
    expect(source).toContain("if (!account?.credential) return null");
    expect(source).toContain("draft.evidence.length === 0");
    expect(source).toContain("approvedContent: draft.content");
    expect(source).toContain("approvedContentHash: socialContentHash");
  });

  it("invalidates approval after an edit and never publishes from approval", async () => {
    const projects = await readFile(projectsPath, "utf8");
    const actions = await readFile(actionsPath, "utf8");
    expect(projects).toContain("approvedContentHash: null");
    expect(projects).toContain("approvedByUserId: null");
    const approvalAction = actions.match(/export async function approveSocialDraftAction[\s\S]*?\n\}/)?.[0];
    expect(approvalAction).toBeDefined();
    expect(approvalAction).not.toMatch(/fetch\(|publishApproved|createPost/i);
  });
});
