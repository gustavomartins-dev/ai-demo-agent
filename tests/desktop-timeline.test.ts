import { describe, expect, it } from "vitest";
import {
  buildEditFilterGraph,
  buildEditTimeline,
  editTimelineDurationSec,
  sourceTimeToOutputTime,
} from "../src/desktop/timeline.js";

describe("buildEditTimeline", () => {
  it("compresses idle gaps hard while keeping each step's own window readable", () => {
    // 45s of silence, a 2s click, 21.5s of silence, a 4s assertVisible, 20s trailing idle.
    const segments = buildEditTimeline(
      [
        { index: 1, interactive: true, startOffsetSec: 45, endOffsetSec: 47 },
        { index: 2, interactive: false, startOffsetSec: 68.5, endOffsetSec: 72.5 },
      ],
      92.5,
    );

    // leading idle, step 1, inter-step idle, step 2, trailing idle
    expect(segments).toHaveLength(5);
    expect(segments[1]?.stepIndex).toBe(1);
    expect(segments[3]?.stepIndex).toBe(2);

    // The two dead gaps (45s and 21.5s) are both trimmed down to the same
    // 1.2s tail — a frozen frame sped up still looks frozen, so there is
    // nothing gained by ramping through it instead of cutting it.
    expect(segments[0]?.speed).toBe(1);
    expect(segments[0]!.sourceEndSec - segments[0]!.sourceStartSec).toBeCloseTo(1.2, 5);
    expect(segments[0]?.sourceEndSec).toBe(45);
    expect(segments[2]?.speed).toBe(1);
    expect(segments[2]!.sourceEndSec - segments[2]!.sourceStartSec).toBeCloseTo(1.2, 5);

    // The 2s click stays at natural speed (under the 3.5s interactive-step budget).
    expect(segments[1]?.speed).toBe(1);
    // The 4s assertVisible-only window is compressed to its smaller 1.5s check budget.
    expect((segments[3]!.sourceEndSec - segments[3]!.sourceStartSec) / segments[3]!.speed).toBeCloseTo(1.5, 1);
  });

  it("never speeds a step segment past maxSpeed even for a very long Hermes call", () => {
    const segments = buildEditTimeline(
      [{ index: 1, interactive: true, startOffsetSec: 0, endOffsetSec: 600 }],
      600,
      { maxSpeed: 12 },
    );
    const step = segments.find((segment) => segment.stepIndex === 1)!;
    expect(step.speed).toBeLessThanOrEqual(12);
  });

  it("applies one uniform correction when the naive plan still runs too long", () => {
    const manySteps = Array.from({ length: 30 }, (_, index) => ({
      index: index + 1,
      interactive: true,
      startOffsetSec: index * 4,
      endOffsetSec: index * 4 + 3.5,
    }));
    const segments = buildEditTimeline(manySteps, manySteps.length * 4, { totalDisplayCeilingSec: 75 });
    expect(editTimelineDurationSec(segments)).toBeLessThanOrEqual(75.5);
  });

  it("falls back to the whole recording at natural speed when no step timing is available", () => {
    expect(buildEditTimeline([], 12)).toEqual([{ sourceStartSec: 0, sourceEndSec: 12, speed: 1 }]);
  });
});

describe("sourceTimeToOutputTime", () => {
  it("maps a source timestamp through mixed-speed segments", () => {
    const segments = [
      { sourceStartSec: 0, sourceEndSec: 10, speed: 5 }, // 2s of output
      { sourceStartSec: 10, sourceEndSec: 13, speed: 1 }, // 3s of output
    ];
    expect(sourceTimeToOutputTime(segments, 0)).toBe(0);
    expect(sourceTimeToOutputTime(segments, 10)).toBe(2);
    expect(sourceTimeToOutputTime(segments, 11.5)).toBeCloseTo(3.5, 5);
    expect(sourceTimeToOutputTime(segments, 13)).toBeCloseTo(5, 5);
  });
});

describe("buildEditFilterGraph", () => {
  it("builds a trim/setpts/concat graph that fits a fixed output canvas", () => {
    const graph = buildEditFilterGraph([
      { sourceStartSec: 0, sourceEndSec: 2, speed: 4 },
      { sourceStartSec: 2, sourceEndSec: 5, speed: 1 },
    ]);
    expect(graph).toContain("trim=start=0.000:end=2.000");
    expect(graph).toContain("setpts=(PTS-STARTPTS)/4.0000");
    expect(graph).toContain("concat=n=2:v=1:a=0[concat]");
    expect(graph).toContain("scale=1280:720:force_original_aspect_ratio=decrease");
    expect(graph).toContain("[outv]");
  });
});
