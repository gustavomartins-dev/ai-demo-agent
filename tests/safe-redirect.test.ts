import { describe, expect, it } from "vitest";

import { safeLocalRedirect } from "../apps/web/src/lib/safe-redirect.js";

describe("safeLocalRedirect", () => {
  it("preserves internal workspace paths", () => {
    expect(safeLocalRedirect("/projects/project-1")).toBe("/projects/project-1");
  });

  it.each(["https://evil.example", "//evil.example", "projects/project-1", null])(
    "falls back to the dashboard for unsafe target %s",
    (target) => expect(safeLocalRedirect(target)).toBe("/"),
  );
});
