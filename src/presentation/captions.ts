import type { DemoStep, DemoTarget } from "../schema.js";
import type { StepExecutionReport } from "../runner.js";
import { sourceTimeToOutputTime, type EditSegment } from "./timeline.js";

function vttText(value: string): string {
  return value.replaceAll(/\s+/g, " ").replaceAll("-->", "→").trim();
}

function targetLabel(target?: DemoTarget): string {
  if (!target) return "";
  return target.name ?? target.text ?? target.role ?? target.testId ?? target.css ?? "";
}

function fallbackCaption(step: DemoStep): string {
  switch (step.action) {
    case "click": return `Clicking ${targetLabel(step.target)}`.trim();
    case "fill": return `Filling in ${targetLabel(step.target)}`.trim();
    case "press": return `Pressing ${step.key}`;
    case "assertVisible": return `${targetLabel(step.target)} is visible`.trim();
    case "goto": return "Opening the product";
    default: return "";
  }
}

/**
 * One caption cue per passed, on-screen step, timed to where that step
 * actually lands in the edited output — not a linear slice of the narration
 * summary across the whole runtime, which is what produced captions that cut
 * off mid-sentence and never matched what was happening on screen.
 *
 * Shared by both the Playwright (web) and Hermes (desktop) runners: both feed
 * it the same demo steps, a passed/failed status per step, and the edit
 * timeline that maps each step's raw-recording window to the edited output.
 */
const MIN_CUE_DISPLAY_SEC = 0.8;

export function buildPresentationCaptions(
  demoSteps: DemoStep[],
  stepReports: Pick<StepExecutionReport, "index" | "status">[],
  segments: EditSegment[],
): string {
  const timestamp = (seconds: number) =>
    `00:${String(Math.floor(seconds / 60)).padStart(2, "0")}:${(seconds % 60).toFixed(3).padStart(6, "0")}`;

  const rawCues = stepReports.flatMap((stepReport) => {
    if (stepReport.status !== "passed") return [];
    const step = demoSteps[stepReport.index - 1];
    const segment = segments.find((candidate) => candidate.stepIndex === stepReport.index);
    if (!step || !segment) return [];
    const text = vttText(step.title ?? fallbackCaption(step));
    if (!text) return [];
    return [{
      outputStartSec: sourceTimeToOutputTime(segments, segment.sourceStartSec),
      outputEndSec: sourceTimeToOutputTime(segments, segment.sourceEndSec),
      text,
    }];
  });

  const cues: string[] = [];
  for (const [index, cue] of rawCues.entries()) {
    // A short step's own window can be shorter than a comfortable reading
    // time, so pad it out — but never past the next cue's start, or two
    // captions would sit on screen at once.
    const nextStartSec = rawCues[index + 1]?.outputStartSec ?? Infinity;
    const endSec = Math.min(Math.max(cue.outputEndSec, cue.outputStartSec + MIN_CUE_DISPLAY_SEC), nextStartSec);
    if (endSec <= cue.outputStartSec) continue;
    cues.push(`${timestamp(cue.outputStartSec)} --> ${timestamp(endSec)}`, cue.text, "");
  }
  return ["WEBVTT", "", ...cues].join("\n");
}
