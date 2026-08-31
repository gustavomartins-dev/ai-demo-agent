import { chromium, type Locator, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Demo, DemoStep, DemoTarget } from "./schema.js";

export type StepExecutionReport = {
  index: number;
  action: DemoStep["action"];
  title?: string;
  status: "passed" | "failed";
  durationMs: number;
  evidencePath?: string;
  error?: string;
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
  reportPath: string;
  report: DemoExecutionReport;
};

export type DemoFailureArtifacts = {
  videoPath: string | null;
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
  const video = page.video();
  const steps: StepExecutionReport[] = [];
  let executionError: unknown;

  for (const [index, step] of demo.steps.entries()) {
    console.log(`[${index + 1}/${demo.steps.length}] ${step.title ?? step.action}`);
    const stepStartedAt = Date.now();

    try {
      await executeStep(page, step);
      let evidencePath: string | undefined;
      if (step.action === "assertVisible") {
        evidencePath = path.join("evidence", `step-${index + 1}-assert-visible.png`);
        await page.screenshot({ path: path.join(outputDir, evidencePath), fullPage: true });
      }
      steps.push({
        index: index + 1,
        action: step.action,
        ...(step.title ? { title: step.title } : {}),
        status: "passed",
        durationMs: Date.now() - stepStartedAt,
        ...(evidencePath ? { evidencePath } : {})
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
      steps.push({
        index: index + 1,
        action: step.action,
        ...(step.title ? { title: step.title } : {}),
        status: "failed",
        durationMs: Date.now() - stepStartedAt,
        ...(screenshotSaved ? { evidencePath } : {}),
        error: errorMessage(error)
      });
      break;
    }
  }

  try {
    await context.close();
  } catch (error) {
    executionError ??= error;
  }

  const videoPath = path.join(outputDir, "demo.webm");
  let videoSaved = false;
  try {
    if (!video) throw new Error("O navegador não produziu uma gravação");
    await video.saveAs(videoPath);
    videoSaved = true;
  } catch (error) {
    executionError ??= error;
  }

  try {
    await browser.close();
  } catch (error) {
    executionError ??= error;
  }

  const report: DemoExecutionReport = {
    demoName: demo.name,
    status: executionError ? "failed" : "passed",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    videoPath: videoSaved ? videoPath : null,
    steps,
    ...(executionError ? { error: errorMessage(executionError) } : {})
  };
  const reportPath = path.join(outputDir, "execution-report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (executionError) {
    throw new DemoRunError(errorMessage(executionError), {
      videoPath: videoSaved ? videoPath : null,
      reportPath,
      report,
    }, { cause: executionError });
  }
  return { videoPath, reportPath, report };
}

export async function runDemo(demo: Demo, outputRoot = "output"): Promise<string> {
  return (await runDemoWithReport(demo, outputRoot)).videoPath;
}
