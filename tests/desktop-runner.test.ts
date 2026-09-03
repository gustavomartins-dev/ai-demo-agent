import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildDesktopStepPrompt,
  desktopFramesHaveVisibleContent,
  runDesktopDemoWithReport,
} from "../src/desktop/runner.js";
import { buildPresentationCaptions } from "../src/presentation/captions.js";

const plan = {
  objective: "Show the native dashboard",
  summary: "Open the plan and verify the hydration dashboard.",
  assumptions: [], warnings: [],
  demo: { name: "native-water", viewport: { width: 1280, height: 720 }, steps: [
    { action: "click" as const, target: { text: "Dashboard" }, title: "Opening the Dashboard tab" },
    { action: "assertVisible" as const, target: { text: "Next reminder" }, title: "Next reminder appears" },
  ] },
};

describe("desktop Hermes runner", () => {
  it("binds the single-step prompt to one pid, window, and step index", () => {
    const prompt = buildDesktopStepPrompt(plan.demo.steps[0]!, 1, plan.demo.steps.length, 4321, "0xe00004");
    expect(prompt).toContain("process id is 4321");
    expect(prompt).toContain("window_id is 0xe00004");
    expect(prompt).toContain("step 1 of 2");
    expect(prompt).toContain("captures its own screenshot evidence independently");
    expect(prompt).toContain("Do not interact with any other process");
  });

  it("accepts only a complete video-backed execution report with host-captured evidence", async () => {
    const root = path.join(os.tmpdir(), `desktop-runner-${crypto.randomUUID()}`);
    const project = path.join(root, "project");
    const output = path.join(root, "output");
    await mkdir(path.join(project, "bin"), { recursive: true });
    const executable = path.join(project, "bin", "product");
    await writeFile(executable, "#!/bin/sh\n", "utf8");
    await chmod(executable, 0o755);
    const launchApp = vi.fn().mockResolvedValue({ pid: 4321, stop: vi.fn().mockResolvedValue(undefined) });
    const startRecorder = vi.fn().mockImplementation(async (_windowId: string, videoPath: string) => {
      await writeFile(videoPath, Buffer.alloc(32));
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    const runHermes = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ status: "passed" }), stderr: "" });
    const captureFrame = vi.fn().mockImplementation(async (_windowId: string, framePath: string) => writeFile(framePath, Buffer.alloc(16)));

    const result = await runDesktopDemoWithReport(plan, { projectPath: project, launchCommand: "./bin/product" },
      { command: "hermes", timeoutMs: 120_000 }, output, {
        allowedRoots: [root], launchApp, resolveWindowId: async () => "0xe00004", startRecorder, runHermes,
        captureFrame,
        frameHasVisibleContent: vi.fn().mockResolvedValue(true),
        validateVideo: vi.fn().mockResolvedValue(undefined),
        videoDuration: vi.fn().mockResolvedValue(6),
        composeVideo: async (_sourcePath, outputPath) => writeFile(outputPath, Buffer.alloc(32)),
      });

    expect(result.report.status).toBe("passed");
    expect(result.videoPath).toMatch(/presentation\.mp4$/);
    expect(result.captionsPath).toMatch(/presentation\.vtt$/);
    // One Hermes call per step, not one call for the whole demo — that is what
    // gives the host a real timestamp and a real screenshot for each step.
    expect(runHermes).toHaveBeenCalledTimes(2);
    expect(captureFrame).toHaveBeenCalledTimes(2);
    expect(result.report.steps).toHaveLength(2);
    expect(result.report.steps[0]?.evidencePath).toBe(path.join("evidence", "step-1-click.png"));
    expect(result.report.steps[0]?.startOffsetSec).toBeGreaterThanOrEqual(0);
    expect(result.report.steps[1]?.endOffsetSec).toBeGreaterThanOrEqual(result.report.steps[0]!.startOffsetSec!);
  });

  it("fails the step and stops early when the host screenshot is black", async () => {
    const root = path.join(os.tmpdir(), `desktop-runner-${crypto.randomUUID()}`);
    const project = path.join(root, "project");
    const output = path.join(root, "output");
    await mkdir(path.join(project, "bin"), { recursive: true });
    const executable = path.join(project, "bin", "product");
    await writeFile(executable, "#!/bin/sh\n", "utf8");
    await chmod(executable, 0o755);
    const launchApp = vi.fn().mockResolvedValue({ pid: 4321, stop: vi.fn().mockResolvedValue(undefined) });
    const startRecorder = vi.fn().mockImplementation(async (_windowId: string, videoPath: string) => {
      await writeFile(videoPath, Buffer.alloc(32));
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    const runHermes = vi.fn().mockResolvedValue({ stdout: JSON.stringify({ status: "passed" }), stderr: "" });

    await expect(runDesktopDemoWithReport(plan, { projectPath: project, launchCommand: "./bin/product" },
      { command: "hermes", timeoutMs: 120_000 }, output, {
        allowedRoots: [root], launchApp, resolveWindowId: async () => "0xe00004", startRecorder, runHermes,
        captureFrame: vi.fn().mockResolvedValue(undefined),
        frameHasVisibleContent: vi.fn().mockResolvedValue(false),
        validateVideo: vi.fn().mockResolvedValue(undefined),
        videoDuration: vi.fn().mockResolvedValue(6),
      })).rejects.toThrow(/black or visually empty/);

    // The model claimed the click succeeded twice, but the host only ever
    // trusted its own screenshot, so it stopped after the first step.
    expect(runHermes).toHaveBeenCalledTimes(1);
  });

  it("creates step-synced WebVTT captions instead of a linear slice of the summary", () => {
    const segments = [
      { sourceStartSec: 0, sourceEndSec: 1.2, speed: 1 },
      { sourceStartSec: 45, sourceEndSec: 47, speed: 1, stepIndex: 1 },
      { sourceStartSec: 66.8, sourceEndSec: 68.3, speed: 1, stepIndex: 2 },
    ];
    const stepReports = [
      { index: 1, status: "passed" as const },
      { index: 2, status: "passed" as const },
    ];

    const captions = buildPresentationCaptions(plan.demo.steps, stepReports, segments);

    expect(captions).toContain("WEBVTT");
    expect(captions).toContain("Opening the Dashboard tab");
    expect(captions).toContain("Next reminder appears");
    // The second cue starts only after the first step's own edited window
    // (1.2s lead-in + step 1's 2s window = 3.2s), not at a linear fraction
    // of the total runtime.
    const captionLines = captions.split("\n");
    const secondCueStart = captionLines.find((line: string, index: number) => captionLines[index + 1] === "Next reminder appears");
    expect(secondCueStart).toMatch(/^00:00:03\.200/);
  });

  it("falls back to a plain description when a step has no title", () => {
    const untitled = { action: "click" as const, target: { name: "Save" } };
    const segments = [{ sourceStartSec: 0, sourceEndSec: 1, speed: 1, stepIndex: 1 }];
    const captions = buildPresentationCaptions([untitled], [{ index: 1, status: "passed" }], segments);
    expect(captions).toContain("Clicking Save");
  });

  it("rejects black frames and accepts frames with visible interface content", () => {
    expect(desktopFramesHaveVisibleContent(Buffer.alloc(64 * 64 * 3))).toBe(false);
    expect(desktopFramesHaveVisibleContent(Buffer.alloc(64 * 64 * 3, 120))).toBe(true);
  });
});
