import { describe, expect, it } from "vitest";
import { demoSchema } from "../src/schema.js";

describe("demoSchema", () => {
  it("aceita um roteiro mínimo", () => {
    const demo = demoSchema.parse({ name: "teste", steps: [{ action: "wait", milliseconds: 100 }] });
    expect(demo.viewport).toEqual({ width: 1280, height: 720 });
  });

  it("recusa esperas excessivas", () => {
    expect(() => demoSchema.parse({ name: "teste", steps: [{ action: "wait", milliseconds: 60_000 }] })).toThrow();
  });
});
