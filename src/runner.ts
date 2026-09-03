import { chromium, type Locator, type Page } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Demo, DemoStep, DemoTarget } from "./schema.js";
import { buildPresentationCaptions } from "./presentation/captions.js";
import { buildEditTimeline, type StepTiming } from "./presentation/timeline.js";
import { composeEditedVideo, ffmpegVideoDurationSeconds } from "./presentation/video.js";

export type StepExecutionReport = {
  index: number;
  action: DemoStep["action"];
  title?: string;
  status: "passed" | "failed";
  durationMs: number;
  evidencePath?: string;
  error?: string;
  /** This step's window in the raw recording, used to build its concise, step-synced edit. */
  startOffsetSec?: number;
  endOffsetSec?: number;
};

export type DemoExecutionReport = {
  demoName: string;
  status: "passed" | "failed";
  startedAt: string;
  finishedAt: string;
  videoPath: string | null;
  steps: StepExecutionReport[];
  error?: string;
};

export type DemoRunResult = {
  videoPath: string;
  captionsPath?: string;
  reportPath: string;
  report: DemoExecutionReport;
};

export type DemoFailureArtifacts = {
  videoPath: string | null;
  captionsPath?: string;
  reportPath: string;
  report: DemoExecutionReport;
};

export class DemoRunError extends Error {
  constructor(message: string, readonly artifacts: DemoFailureArtifacts, options?: ErrorOptions) {
    super(message, options);
    this.name = "DemoRunError";
  }
}

function locate(page: Page, target: DemoTarget): Locator {
  if (target.testId) return page.getByTestId(target.testId);
  if (target.role) return page.getByRole(target.role as never, target.name ? { name: target.name } : undefined);
  if (target.text) return page.getByText(target.text, { exact: true });
  if (target.css) return page.locator(target.css);
  throw new Error("Alvo inválido");
}

async function executeStep(page: Page, step: DemoStep): Promise<void> {
  if (step.action === "goto") await page.goto(step.url, { waitUntil: "domcontentloaded" });
  if (step.action === "click") await locate(page, step.target).click();
  if (step.action === "fill") await locate(page, step.target).fill(step.value);
  if (step.action === "press") await locate(page, step.target).press(step.key);
  if (step.action === "wait") await page.waitForTimeout(step.milliseconds);
  if (step.action === "assertVisible") await locate(page, step.target).waitFor({ state: "visible" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const INTERACTIVE_ACTIONS: DemoStep["action"][] = ["goto", "click", "fill", "press"];

export async function runDemoWithReport(demo: Demo, outputRoot = "output"): Promise<DemoRunResult> {
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replaceAll(":", "-");
  const outputDir = path.resolve(outputRoot, `${demo.name.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}-${stamp}`);
  const evidenceDir = path.join(outputDir, "evidence");
  await mkdir(evidenceDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: demo.viewport,
    recordVideo: { dir: outputDir, size: demo.viewport }
  });
  const page = await context.newPage();
  const recordingStartedAtMs = Date.now();
  const video = page.video();
  const stepReports: StepExecutionReport[] = [];
  const stepTimings: StepTiming[] = [];
  let executionError: unknown;

  for (const [index, step] of demo.steps.entries()) {
    console.log(`[${index + 1}/${demo.steps.length}] ${step.title ?? step.action}`);
    const stepStartedAtMs = Date.now();

    try {
      await executeStep(page, step);
      let evidencePath: string | undefined;
      if (step.action === "assertVisible") {
        evidencePath = path.join("evidence", `step-${index + 1}-assert-visible.png`);
        await page.screenshot({ path: path.join(outputDir, evidencePath), fullPage: true });
      }
      const stepFinishedAtMs = Date.now();
      stepTimings.push({
        index: index + 1,
        interactive: INTERACTIVE_ACTIONS.includes(step.action),
        startOffsetSec: Math.max(0, (stepStartedAtMs - recordingStartedAtMs) / 1000),
        endOffsetSec: Math.max(0, (stepFinishedAtMs - recordingStartedAtMs) / 1000),
      });
      stepReports.push({
        index: index + 1,
        action: step.action,
        ...(step.title ? { title: step.title } : {}),
        status: "passed",
        durationMs: stepFinishedAtMs - stepStartedAtMs,
        ...(evidencePath ? { evidencePath } : {}),
        startOffsetSec: stepTimings.at(-1)!.startOffsetSec,
        endOffsetSec: stepTimings.at(-1)!.endOffsetSec,
      });
    } catch (error) {
      executionError = error;
      const evidencePath = path.join("evidence", `step-${index + 1}-failure.png`);
      let screenshotSaved = false;
      try {
        await page.screenshot({ path: path.join(outputDir, evidencePath), fullPage: true });
        screenshotSaved = true;
      } catch {
        // The report still records the original browser failure.
      }
      const stepFinishedAtMs = Date.now();
      stepTimings.push({
        index: index + 1,
        interactive: INTERACTIVE_ACTIONS.includes(step.action),
        startOffsetSec: Math.max(0, (stepStartedAtMs - recordingStartedAtMs) / 1000),
        endOffsetSec: Math.max(0, (stepFinishedAtMs - recordingStartedAtMs) / 1000),
      });
      stepReports.push({
        index: index + 1,
        action: step.action,
        ...(step.title ? { title: step.title } : {}),
        status: "failed",
        durationMs: stepFinishedAtMs - stepStartedAtMs,
        ...(screenshotSaved ? { evidencePath } : {}),
        error: errorMessage(error),
        startOffsetSec: stepTimings.at(-1)!.startOffsetSec,
        endOffsetSec: stepTimings.at(-1)!.endOffsetSec,
      });
      break;
    }
  }

  try {
    await context.close();
  } catch (error) {
    executionError ??= error;
  }

  const rawVideoPath = path.join(outputDir, "recording-raw.webm");
  let rawVideoSaved = false;
  try {
    if (!video) throw new Error("O navegador não produziu uma gravação");
    await video.saveAs(rawVideoPath);
    rawVideoSaved = true;
    // Playwright's own recording lands at a page-scoped path inside outputDir;
    // saveAs() copies rather than moves it, which otherwise leaves that raw
    // file sitting next to ours forever, doubling disk use per run.
    const originalPath = await video.path().catch(() => null);
    if (originalPath && path.resolve(originalPath) !== path.resolve(rawVideoPath)) {
      await rm(originalPath, { force: true }).catch(() => {});
    }
  } catch (error) {
    executionError ??= error;
  }

  try {
    await browser.close();
  } catch (error) {
    executionError ??= error;
  }

  const videoPath = path.join(outputDir, "presentation.mp4");
  const captionsPath = path.join(outputDir, "presentation.vtt");
  let videoAvailable = false;
  if (!executionError && rawVideoSaved) {
    try {
      const recordingDurationSec = await ffmpegVideoDurationSeconds(rawVideoPath);
      const editSegments = buildEditTimeline(stepTimings, recordingDurationSec);
      await composeEditedVideo(rawVideoPath, videoPath, editSegments, demo.viewport);
      videoAvailable = true;
      await writeFile(captionsPath, buildPresentationCaptions(demo.steps, stepReports, editSegments), "utf8");
    } catch (error) {
      executionError ??= error;
    }
  }

  const report: DemoExecutionReport = {
    demoName: demo.name,
    status: executionError ? "failed" : "passed",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    videoPath: videoAvailable ? videoPath : null,
    steps: stepReports,
    ...(executionError ? { error: errorMessage(executionError) } : {})
  };
  const reportPath = path.join(outputDir, "execution-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (executionError) {
    throw new DemoRunError(errorMessage(executionError), {
      videoPath: videoAvailable ? videoPath : null,
      ...(videoAvailable ? { captionsPath } : {}),
      reportPath,
      report,
    }, { cause: executionError });
  }
  return { videoPath, captionsPath, reportPath, report };
}

export async function runDemo(demo: Demo, outputRoot = "output"): Promise<string> {
  return (await runDemoWithReport(demo, outputRoot)).videoPath;
}
