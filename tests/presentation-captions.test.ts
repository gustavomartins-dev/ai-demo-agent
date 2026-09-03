import { describe, expect, it } from "vitest";
import { buildPresentationCaptions } from "../src/presentation/captions.js";
import type { DemoStep } from "../src/schema.js";

describe("buildPresentationCaptions", () => {
  it("never lets one cue's minimum display time overlap the next cue's start", () => {
    // Three real steps back to back in under a second, like a trivial page
    // with almost no idle between actions — the case that actually surfaced
    // this bug against the Playwright example demo.
    const demoSteps: DemoStep[] = [
      { action: "goto", url: "https://example.com", title: "Opening the site" },
      { action: "assertVisible", target: { text: "Home" }, title: "Confirming the homepage" },
      { action: "wait", milliseconds: 100, title: "Showing the interface" },
    ];
    const segments = [
      { sourceStartSec: 0, sourceEndSec: 0.31, speed: 1, stepIndex: 1 },
      { sourceStartSec: 0.31, sourceEndSec: 0.68, speed: 1, stepIndex: 2 },
      { sourceStartSec: 0.68, sourceEndSec: 2.16, speed: 1, stepIndex: 3 },
    ];
    const stepReports = [
      { index: 1, status: "passed" as const },
      { index: 2, status: "passed" as const },
      { index: 3, status: "passed" as const },
    ];

    const captions = buildPresentationCaptions(demoSteps, stepReports, segments);
    const cueLines = captions.split("\n").filter((line) => line.includes("-->"));
    expect(cueLines).toHaveLength(3);

    const parseSec = (timestamp: string) => {
      const [, minutes, seconds] = timestamp.match(/(\d+):(\d+\.\d+)/) ?? [];
      return Number(minutes) * 60 + Number(seconds);
    };
    const [starts, ends] = [
      cueLines.map((line) => parseSec(line.split(" --> ")[0]!)),
      cueLines.map((line) => parseSec(line.split(" --> ")[1]!)),
    ];
    for (let index = 0; index < starts.length - 1; index += 1) {
      expect(ends[index]).toBeLessThanOrEqual(starts[index + 1]!);
    }
  });

  it("pads a short step's display time when there is room before the next cue", () => {
    const demoSteps: DemoStep[] = [
      { action: "click", target: { name: "Save" }, title: "Saving the form" },
      { action: "assertVisible", target: { text: "Saved" }, title: "Confirmation appears" },
    ];
    const segments = [
      { sourceStartSec: 0, sourceEndSec: 0.1, speed: 1, stepIndex: 1 },
      { sourceStartSec: 3.8, sourceEndSec: 5, speed: 1 }, // the idle gap's trimmed tail
      { sourceStartSec: 5, sourceEndSec: 6, speed: 1, stepIndex: 2 },
    ];
    const stepReports = [
      { index: 1, status: "passed" as const },
      { index: 2, status: "passed" as const },
    ];

    const captions = buildPresentationCaptions(demoSteps, stepReports, segments);
    expect(captions).toContain("00:00:00.000 --> 00:00:00.800");
  });

  it("skips a failed step and one with no usable text", () => {
    const demoSteps: DemoStep[] = [
      { action: "wait", milliseconds: 100 },
      { action: "click", target: { name: "Save" }, title: "Saving the form" },
    ];
    const segments = [
      { sourceStartSec: 0, sourceEndSec: 0.1, speed: 1, stepIndex: 1 },
      { sourceStartSec: 0.1, sourceEndSec: 1, speed: 1, stepIndex: 2 },
    ];
    const stepReports = [
      { index: 1, status: "failed" as const },
      { index: 2, status: "passed" as const },
    ];

    const captions = buildPresentationCaptions(demoSteps, stepReports, segments);
    expect(captions.split("\n").filter((line) => line.includes("-->"))).toHaveLength(1);
    expect(captions).toContain("Saving the form");
  });
});
