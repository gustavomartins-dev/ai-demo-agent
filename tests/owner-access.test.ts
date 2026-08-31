import { describe, expect, it } from "vitest";

import { isWorkspaceOwner } from "../apps/web/src/lib/owner-access";

describe("isWorkspaceOwner", () => {
  it("allows the configured GitHub login without case sensitivity", () => {
    expect(isWorkspaceOwner("GustavoMartins-Dev", "gustavomartins-dev")).toBe(true);
  });

  it("rejects any other GitHub identity", () => {
    expect(isWorkspaceOwner("another-user", "gustavomartins-dev")).toBe(false);
  });

  it("fails closed when the owner login is not configured", () => {
    expect(isWorkspaceOwner("gustavomartins-dev", undefined)).toBe(false);
  });
});
