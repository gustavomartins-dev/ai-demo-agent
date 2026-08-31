import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { parseByteRange, RangeNotSatisfiableError, resolveArtifactPath } from "../apps/web/src/lib/media-delivery.js";

describe("owner media delivery", () => {
  it("contains storage keys inside the configured output root", () => {
    expect(resolveArtifactPath("/srv/output", "run/demo.webm")).toBe(path.resolve("/srv/output/run/demo.webm"));
    expect(() => resolveArtifactPath("/srv/output", "../secret")).toThrow(/escapes/);
    expect(() => resolveArtifactPath("/srv/output", "/etc/passwd")).toThrow(/Invalid/);
    expect(() => resolveArtifactPath("/srv/output", "")).toThrow(/Invalid/);
  });

  it("parses browser byte ranges and rejects invalid ranges", () => {
    expect(parseByteRange(null, 100)).toBeNull();
    expect(parseByteRange("bytes=10-19", 100)).toEqual({ start: 10, end: 19 });
    expect(parseByteRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseByteRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(() => parseByteRange("bytes=100-120", 100)).toThrow(RangeNotSatisfiableError);
    expect(() => parseByteRange("bytes=0-1,5-8", 100)).toThrow(RangeNotSatisfiableError);
  });

  it("resolves ready assets by database ID and authenticated ownership", async () => {
    const route = await readFile(new URL("../apps/web/src/app/api/media/[assetId]/route.ts", import.meta.url), "utf8");
    expect(route).toContain("const session = await auth()");
    expect(route).toContain('id: (await params).assetId, status: "READY"');
    expect(route).toContain("project: { ownerId: session.user.id }");
    expect(route).toContain('status: 416');
    expect(route).toContain('status: range ? 206 : 200');
    expect(route).toContain('"Cache-Control": "private, no-store"');
  });
});
