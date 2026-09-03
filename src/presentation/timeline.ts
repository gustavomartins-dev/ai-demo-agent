// Turns host-measured step timestamps into a concise edit plan.
//
// Desktop steps run one Hermes Computer Use call at a time, so we know exactly
// when each step's call started and finished relative to the raw recording.
// Most of that window is model "thinking" time, not on-screen action, so every
// gap between steps gets trimmed hard. Each step's own window gets a display
// budget too: a real budget for an interactive step (click/fill/press) since
// the change may land anywhere in that window, and a short one for a step
// that only confirms something already on screen (assertVisible/wait) —
// several of those in a row over an unchanging frame shouldn't each claim
// as much screen time as an actual interaction.

export type StepTiming = {
  index: number;
  /** click/fill/press change what's on screen; assertVisible/wait only confirm it. */
  interactive: boolean;
  startOffsetSec: number;
  endOffsetSec: number;
};

export type EditSegment = {
  sourceStartSec: number;
  sourceEndSec: number;
  speed: number;
  stepIndex?: number;
};

export type EditTimelineOptions = {
  /** Display budget for dead time between steps (and before the first / after the last). */
  idleGapDisplaySec?: number;
  /** Display budget for a step that changes what's on screen (click/fill/press). */
  interactiveStepDisplaySec?: number;
  /** Display budget for a step that only confirms something already visible (assertVisible/wait). */
  checkStepDisplaySec?: number;
  /** Never compress a segment faster than this multiplier. */
  maxSpeed?: number;
  /** If the naive plan still runs longer than this, apply one more uniform correction. */
  totalDisplayCeilingSec?: number;
};

// A dead gap has no motion to preserve — a static frame sped up still looks
// static. Trim it instead of speeding through it, keeping the tail end (the
// moment right before the next thing happens) rather than the start.
function trimmedIdleSegment(sourceStartSec: number, sourceEndSec: number, displayCapSec: number): EditSegment | null {
  const durationSec = sourceEndSec - sourceStartSec;
  if (durationSec <= 0.001) return null;
  if (durationSec <= displayCapSec) return { sourceStartSec, sourceEndSec, speed: 1 };
  return { sourceStartSec: sourceEndSec - displayCapSec, sourceEndSec, speed: 1 };
}

// A step's own window might change on screen at any point during the Hermes
// call, so it is sped through rather than trimmed — that keeps a shot at
// seeing the transition instead of risking cutting it off.
function speedRampedStepSegment(
  sourceStartSec: number,
  sourceEndSec: number,
  displayCapSec: number,
  maxSpeed: number,
  stepIndex: number,
): EditSegment | null {
  const durationSec = sourceEndSec - sourceStartSec;
  if (durationSec <= 0.001) return null;
  const speed = durationSec <= displayCapSec ? 1 : Math.min(maxSpeed, durationSec / displayCapSec);
  return { sourceStartSec, sourceEndSec, speed, stepIndex };
}

export function buildEditTimeline(
  steps: StepTiming[],
  recordingDurationSec: number,
  options: EditTimelineOptions = {},
): EditSegment[] {
  // Without step timing there is nothing to compress around — leave the
  // recording untouched rather than guess.
  if (!steps.length) return [{ sourceStartSec: 0, sourceEndSec: recordingDurationSec, speed: 1 }];

  const idleGapDisplaySec = options.idleGapDisplaySec ?? 1.2;
  const interactiveStepDisplaySec = options.interactiveStepDisplaySec ?? 3.5;
  const checkStepDisplaySec = options.checkStepDisplaySec ?? 1.5;
  const maxSpeed = options.maxSpeed ?? 12;
  const totalDisplayCeilingSec = options.totalDisplayCeilingSec ?? 75;

  const orderedSteps = steps
    .map((step) => ({
      index: step.index,
      interactive: step.interactive,
      startOffsetSec: Math.max(0, Math.min(step.startOffsetSec, recordingDurationSec)),
      endOffsetSec: Math.max(0, Math.min(step.endOffsetSec, recordingDurationSec)),
    }))
    .filter((step) => step.endOffsetSec > step.startOffsetSec)
    .sort((a, b) => a.startOffsetSec - b.startOffsetSec);

  const segments: EditSegment[] = [];
  let cursor = 0;
  for (const step of orderedSteps) {
    const gap = trimmedIdleSegment(cursor, step.startOffsetSec, idleGapDisplaySec);
    if (gap) segments.push(gap);
    const displayCapSec = step.interactive ? interactiveStepDisplaySec : checkStepDisplaySec;
    const action = speedRampedStepSegment(step.startOffsetSec, step.endOffsetSec, displayCapSec, maxSpeed, step.index);
    if (action) segments.push(action);
    cursor = Math.max(cursor, step.endOffsetSec);
  }
  const trailing = trimmedIdleSegment(cursor, recordingDurationSec, idleGapDisplaySec);
  if (trailing) segments.push(trailing);

  if (!segments.length) return [{ sourceStartSec: 0, sourceEndSec: recordingDurationSec, speed: 1 }];

  const totalDisplaySec = editTimelineDurationSec(segments);
  if (totalDisplaySec > totalDisplayCeilingSec) {
    const correction = totalDisplaySec / totalDisplayCeilingSec;
    return segments.map((segment) => ({ ...segment, speed: segment.speed * correction }));
  }
  return segments;
}

export function editTimelineDurationSec(segments: EditSegment[]): number {
  return segments.reduce((total, segment) => total + (segment.sourceEndSec - segment.sourceStartSec) / segment.speed, 0);
}

/** Converts a timestamp in the raw recording into its timestamp in the edited output. */
export function sourceTimeToOutputTime(segments: EditSegment[], sourceTimeSec: number): number {
  let elapsedOutputSec = 0;
  for (const segment of segments) {
    if (sourceTimeSec <= segment.sourceStartSec) return elapsedOutputSec;
    const coveredSourceSec = Math.min(sourceTimeSec, segment.sourceEndSec) - segment.sourceStartSec;
    elapsedOutputSec += coveredSourceSec / segment.speed;
    if (sourceTimeSec <= segment.sourceEndSec) return elapsedOutputSec;
  }
  return elapsedOutputSec;
}

export function buildEditFilterGraph(
  segments: EditSegment[],
  canvas: { width: number; height: number } = { width: 1280, height: 720 },
): string {
  const trims = segments.map((segment, index) =>
    `[0:v]trim=start=${segment.sourceStartSec.toFixed(3)}:end=${segment.sourceEndSec.toFixed(3)},setpts=(PTS-STARTPTS)/${segment.speed.toFixed(4)}[v${index}]`
  );
  const concatInputs = segments.map((_, index) => `[v${index}]`).join("");
  const fit = `scale=${canvas.width}:${canvas.height}:force_original_aspect_ratio=decrease,pad=${canvas.width}:${canvas.height}:(ow-iw)/2:(oh-ih)/2:color=black`;
  return `${trims.join(";")};${concatInputs}concat=n=${segments.length}:v=1:a=0[concat];[concat]${fit}[outv]`;
}
