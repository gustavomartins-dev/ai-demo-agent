import { chromium, type Locator, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Demo, DemoTarget } from "./schema.js";

function locate(page: Page, target: DemoTarget): Locator {
  if (target.testId) return page.getByTestId(target.testId);
  if (target.role) return page.getByRole(target.role as never, target.name ? { name: target.name } : undefined);
  if (target.text) return page.getByText(target.text, { exact: true });
  if (target.css) return page.locator(target.css);
  throw new Error("Alvo inválido");
}

export async function runDemo(demo: Demo, outputRoot = "output"): Promise<string> {
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const outputDir = path.resolve(outputRoot, `${demo.name.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}-${stamp}`);
  await mkdir(outputDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: demo.viewport,
    recordVideo: { dir: outputDir, size: demo.viewport }
  });
  const page = await context.newPage();
  const video = page.video();
  let executionError: unknown;

  try {
    for (const [index, step] of demo.steps.entries()) {
      console.log(`[${index + 1}/${demo.steps.length}] ${step.title ?? step.action}`);
      if (step.action === "goto") await page.goto(step.url, { waitUntil: "networkidle" });
      if (step.action === "click") await locate(page, step.target).click();
      if (step.action === "fill") await locate(page, step.target).fill(step.value);
      if (step.action === "press") await locate(page, step.target).press(step.key);
      if (step.action === "wait") await page.waitForTimeout(step.milliseconds);
      if (step.action === "assertVisible") await locate(page, step.target).waitFor({ state: "visible" });
    }
  } catch (error) {
    executionError = error;
  } finally {
    await context.close();
  }

  const videoPath = path.join(outputDir, "demo.webm");
  try {
    if (!video) throw new Error("O navegador não produziu uma gravação");
    await video.saveAs(videoPath);
  } finally {
    await browser.close();
  }

  if (executionError) throw executionError;
  return videoPath;
}
