import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

import { socialDraftEditSchema } from "../apps/web/src/lib/social-draft-input.js";

const pagePath = new URL("../apps/web/src/app/projects/[id]/page.tsx", import.meta.url);

describe("social draft review", () => {
  it("enforces the platform limits independently", () => {
    expect(socialDraftEditSchema.parse({ draftId: "draft-x", platform: "X", content: "x".repeat(280) }).platform).toBe("X");
    expect(() => socialDraftEditSchema.parse({ draftId: "draft-x", platform: "X", content: "x".repeat(281) })).toThrow(/280/);
    expect(socialDraftEditSchema.parse({ draftId: "draft-linkedin", platform: "LINKEDIN", content: "x".repeat(3_000) }).platform).toBe("LINKEDIN");
    expect(() => socialDraftEditSchema.parse({ draftId: "draft-linkedin", platform: "LINKEDIN", content: "x".repeat(3_001) })).toThrow(/3,000/);
  });

  it("shows provenance and explicitly keeps publishing disabled", async () => {
    const source = await readFile(pagePath, "utf8");
    expect(source).toContain("Verified evidence used");
    expect(source).toContain("Suggested mentions");
    expect(source).toContain("Review only · publishing disabled");
  });
});
