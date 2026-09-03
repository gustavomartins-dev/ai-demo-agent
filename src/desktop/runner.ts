import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { HermesConfig } from "../hermes/config.js";
import { hermesDemoPlanSchema, type HermesDemoPlan } from "../hermes/contract.js";
import { DemoRunError, type DemoExecutionReport, type DemoRunResult, type StepExecutionReport } from "../runner.js";
import type { DemoStep } from "../schema.js";
import { buildPresentationCaptions } from "../presentation/captions.js";
import { buildNarrationScript, loadNarrationConfig, synthesizeNarration } from "../presentation/narration.js";
import { buildEditTimeline, type EditSegment, type StepTiming } from "../presentation/timeline.js";
import { composeEditedVideo } from "../presentation/video.js";
import { desktopProjectRoots, resolveDesktopLaunch } from "./launch.js";

const execFileAsync = promisify(execFile);
const ffmpegPath = createRequire(import.meta.url)("ffmpeg-static") as string | null;

const stepResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  error: z.string().min(1).optional(),
});

type RuntimeEnvironment = NodeJS.ProcessEnv;
type HermesRunner = (command: string, args: string[], options: { cwd: string; timeout: number; env?: RuntimeEnvironment }) => Promise<{ stdout: string; stderr: string }>;
type LaunchedApp = { pid: number; stop(): Promise<void> };
type AppLauncher = (executable: string, args: string[], cwd: string, environment?: RuntimeEnvironment) => Promise<LaunchedApp>;
type DesktopRecorder = { stop(): Promise<void> };
type RecorderStarter = (windowId: string, videoPath: string, environment?: RuntimeEnvironment) => Promise<DesktopRecorder>;
type VideoValidator = (videoPath: string) => Promise<void>;
type VideoComposer = (sourcePath: string, outputPath: string, segments: EditSegment[]) => Promise<void>;
type VideoDurationReader = (videoPath: string) => Promise<number>;
type FrameCapturer = (windowId: string, outputPath: string, environment?: RuntimeEnvironment) => Promise<void>;
type FrameValidator = (framePath: string) => Promise<boolean>;
type VirtualDisplay = { environment: RuntimeEnvironment; stop(): Promise<void> };

const defaultHermesRunner: HermesRunner = async (command, args, options) => {
  const ffmpegPath = process.env.AI_DEMO_FFMPEG_PATH;
  const baseEnvironment = options.env ?? process.env;
  const environment = ffmpegPath
    ? { ...baseEnvironment, PATH: `${path.dirname(ffmpegPath)}${path.delimiter}${baseEnvironment.PATH ?? ""}` }
    : baseEnvironment;
  const result = await execFileAsync(command, args, { ...options, env: environment, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

const defaultAppLauncher: AppLauncher = async (executable, args, cwd, runtimeEnvironment = process.env) => {
  const environment = process.platform === "linux"
    ? {
        ...runtimeEnvironment,
        GDK_BACKEND: process.env.AI_DEMO_DESKTOP_GDK_BACKEND ?? "x11",
        // GTK4's GPU renderer can leave the X11 backing pixmap black even while
        // the compositor displays the window. Cairo keeps pixels capturable by ximagesrc.
        GSK_RENDERER: process.env.AI_DEMO_DESKTOP_GSK_RENDERER ?? "cairo",
      }
    : runtimeEnvironment;
  const child = spawn(executable, args, { cwd, env: environment, stdio: "ignore" });
  await new Promise<void>((resolve, reject) => {
    child.once("spawn", resolve);
    child.once("error", reject);
  });
  if (!child.pid) throw new Error("Desktop application did not expose a process id");
  return {
    pid: child.pid,
    async stop() {
      if (child.exitCode !== null || child.signalCode !== null) return;
      child.kill("SIGTERM");
      await Promise.race([
        new Promise<void>((resolve) => child.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 3_000)),
      ]);
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    },
  };
};

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function resolveX11WindowId(pid: number, timeoutMs = 20_000, environment: RuntimeEnvironment = process.env): Promise<string | undefined> {
  if (process.platform !== "linux") return undefined;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      throw new Error(`Desktop process ${pid} exited before its window appeared; it likely crashed on launch`);
    }
    try {
      let windowIds: string[] = [];
      try {
        const root = await execFileAsync("xprop", ["-root", "_NET_CLIENT_LIST"], { encoding: "utf8", env: environment });
        windowIds = root.stdout.match(/0x[0-9a-f]+/gi) ?? [];
      } catch {
        // A bare Xvfb display has no EWMH window manager or _NET_CLIENT_LIST.
      }
      if (!windowIds.length) {
        const tree = await execFileAsync("xwininfo", ["-root", "-tree"], { encoding: "utf8", env: environment });
        windowIds = [...new Set([...tree.stdout.matchAll(/^\s*(0x[0-9a-f]+)\b/gim)].flatMap((match) => match[1] ? [match[1]] : []))];
      }
      for (const windowId of windowIds) {
        try {
          const property = await execFileAsync("xprop", ["-id", windowId, "_NET_WM_PID"], { encoding: "utf8", env: environment });
          if (property.stdout.match(/=\s*(\d+)/)?.[1] === String(pid)) return windowId;
        } catch {
          // Root, helper, and synthetic geometry ids do not expose _NET_WM_PID.
        }
      }
    } catch {
      // The window manager may not have registered the new window yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

async function resolveWindowGeometry(windowId: string, environment: RuntimeEnvironment): Promise<{ x: number; y: number; width: number; height: number }> {
  const info = await execFileAsync("xwininfo", ["-id", windowId], { encoding: "utf8", env: environment });
  const read = (label: string) => Number(info.stdout.match(new RegExp(`${label}:\\s*(-?\\d+)`))?.[1]);
  const x = read("Absolute upper-left X");
  const y = read("Absolute upper-left Y");
  const width = read("Width");
  const height = read("Height");
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`Could not resolve X11 geometry for window ${windowId}`);
  }
  return { x, y, width, height };
}

const startGStreamerRecorder: RecorderStarter = async (windowId, videoPath, environment = process.env) => {
  const { x, y, width, height } = await resolveWindowGeometry(windowId, environment);
  const recorder = spawn("gst-launch-1.0", [
    "-e",
    "ximagesrc", `startx=${x}`, `starty=${y}`, `endx=${x + width - 1}`, `endy=${y + height - 1}`, "use-damage=0", "show-pointer=true",
    "!", "video/x-raw,framerate=30/1",
    "!", "videoconvert",
    "!", "video/x-raw,format=I420",
    "!", "x264enc", "speed-preset=ultrafast", "tune=zerolatency",
    "!", "mp4mux",
    "!", "filesink", `location=${videoPath}`,
  ], { stdio: "ignore", env: environment });
  await new Promise<void>((resolve, reject) => {
    recorder.once("spawn", resolve);
    recorder.once("error", reject);
  });
  return {
    async stop() {
      if (recorder.exitCode !== null || recorder.signalCode !== null) return;
      recorder.kill("SIGINT");
      await Promise.race([
        new Promise<void>((resolve) => recorder.once("exit", () => resolve())),
        new Promise<void>((resolve) => setTimeout(resolve, 5_000)),
      ]);
      if (recorder.exitCode === null && recorder.signalCode === null) recorder.kill("SIGTERM");
    },
  };
};

async function startVirtualX11Display(): Promise<VirtualDisplay> {
  const executable = process.env.AI_DEMO_XVFB_PATH ?? "Xvfb";
  const openboxRoot = process.env.AI_DEMO_OPENBOX_ROOT;
  for (let displayNumber = 90; displayNumber <= 119; displayNumber += 1) {
    const display = `:${displayNumber}`;
    const screenSize = process.env.AI_DEMO_XVFB_SCREEN_SIZE ?? "1600x1000x24";
    const server = spawn(executable, [display, "-screen", "0", screenSize, "-ac", "-nolisten", "tcp"], { stdio: "ignore" });
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("spawn", resolve);
        server.once("error", reject);
      });
      const environment: RuntimeEnvironment = { ...process.env, DISPLAY: display };
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        try {
          await execFileAsync("xprop", ["-root"], { encoding: "utf8", env: environment });
          const windowManagerEnvironment = openboxRoot ? {
            ...environment,
            LD_LIBRARY_PATH: `${path.join(openboxRoot, "usr/lib/x86_64-linux-gnu")}${path.delimiter}${environment.LD_LIBRARY_PATH ?? ""}`,
            XDG_DATA_DIRS: `${path.join(openboxRoot, "usr/share")}${path.delimiter}${environment.XDG_DATA_DIRS ?? "/usr/local/share:/usr/share"}`,
          } : environment;
          const windowManager = spawn(
            openboxRoot ? path.join(openboxRoot, "usr/bin/openbox") : (process.env.AI_DEMO_X11_WINDOW_MANAGER_PATH ?? "openbox"),
            [],
            { env: windowManagerEnvironment, stdio: "ignore" },
          );
          await new Promise<void>((resolve, reject) => {
            windowManager.once("spawn", resolve);
            windowManager.once("error", reject);
          });
          const managerDeadline = Date.now() + 5_000;
          while (Date.now() < managerDeadline) {
            try {
              const manager = await execFileAsync("xprop", ["-root", "_NET_SUPPORTING_WM_CHECK"], { encoding: "utf8", env: environment });
              if (/window id # 0x[0-9a-f]+/i.test(manager.stdout)) break;
            } catch {
              // Openbox is still claiming the virtual display.
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
          return {
            environment: windowManagerEnvironment,
            async stop() {
              if (windowManager.exitCode === null && windowManager.signalCode === null) windowManager.kill("SIGTERM");
              if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
            },
          };
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
    } catch (error) {
      if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`Xvfb is required for reliable desktop recording on Linux. Configure AI_DEMO_XVFB_PATH or install xvfb.`, { cause: error });
      }
    }
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGTERM");
  }
  throw new Error("Could not allocate an isolated X11 display for desktop recording");
}

export async function validateDesktopVideo(videoPath: string): Promise<void> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-demo-video-check-"));
  const rawPath = path.join(temporaryDirectory, "frames.rgb");
  try {
    await execFileAsync("gst-launch-1.0", [
      "-q", "filesrc", `location=${videoPath}`, "!", "decodebin", "!", "videoconvert", "!", "videoscale", "!",
      "video/x-raw,format=RGB,width=64,height=64", "!", "identity", "eos-after=30", "!", "filesink", `location=${rawPath}`,
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    const frames = await readFile(rawPath);
    const frameBytes = 64 * 64 * 3;
    if (frames.length < frameBytes) throw new Error("Desktop recorder produced no decodable video frames");
    if (!desktopFramesHaveVisibleContent(frames)) {
      throw new Error("Desktop recording quality gate rejected a black or visually empty video");
    }
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function desktopVideoDuration(videoPath: string): Promise<number> {
  const discovery = await execFileAsync("gst-discoverer-1.0", [videoPath], { encoding: "utf8" });
  const duration = discovery.stdout.match(/Duration:\s+(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!duration) throw new Error("Could not determine the desktop recording duration");
  return Number(duration[1]) * 3600 + Number(duration[2]) * 60 + Number(duration[3]);
}

export async function addNarrationToVideo(videoPath: string, narrationPath: string, outputPath: string): Promise<void> {
  // -shortest caps the mux at whichever of the two streams is shorter. The
  // narration script length is only an estimate of the edited video's final
  // length, so without this the narration can run past the video (dead air
  // over a frozen last frame) or the video past the narration (silence).
  await execFileAsync(ffmpegPath ?? "ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", videoPath, "-i", narrationPath,
    "-c:v", "copy", "-c:a", "aac", "-shortest",
    outputPath,
  ], { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
}

export function desktopFramesHaveVisibleContent(frames: Buffer): boolean {
  let bestVisibleRatio = 0;
  const frameBytes = 64 * 64 * 3;
  for (let offset = 0; offset + frameBytes <= frames.length; offset += frameBytes) {
    let visiblePixels = 0;
    for (let pixel = offset; pixel < offset + frameBytes; pixel += 3) {
      if (Math.max(frames[pixel] ?? 0, frames[pixel + 1] ?? 0, frames[pixel + 2] ?? 0) >= 24) visiblePixels += 1;
    }
    bestVisibleRatio = Math.max(bestVisibleRatio, visiblePixels / (64 * 64));
  }
  return bestVisibleRatio >= 0.03;
}

export async function captureWindowFrame(windowId: string, outputPath: string, environment: RuntimeEnvironment = process.env): Promise<void> {
  const { x, y, width, height } = await resolveWindowGeometry(windowId, environment);
  await execFileAsync("gst-launch-1.0", [
    "-q", "ximagesrc", `startx=${x}`, `starty=${y}`, `endx=${x + width - 1}`, `endy=${y + height - 1}`, "num-buffers=1",
    "!", "videoconvert", "!", "pngenc", "!", "filesink", `location=${outputPath}`,
  ], { encoding: "utf8", env: environment, maxBuffer: 4 * 1024 * 1024 });
}

export async function verifyWindowFrameHasContent(framePath: string): Promise<boolean> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "ai-demo-step-evidence-"));
  const rawPath = path.join(temporaryDirectory, "frame.rgb");
  try {
    await execFileAsync(ffmpegPath ?? "ffmpeg", [
      "-hide_banner", "-loglevel", "error", "-y", "-i", framePath,
      "-vf", "scale=64:64", "-pix_fmt", "rgb24", "-frames:v", "1", "-f", "rawvideo", rawPath,
    ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
    return desktopFramesHaveVisibleContent(await readFile(rawPath));
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function extractJson(response: string): unknown {
  const trimmed = response.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

export function buildDesktopStepPrompt(step: DemoStep, stepNumber: number, totalSteps: number, pid: number, windowId?: string): string {
  return [
    "Operate one already-launched native desktop application to execute exactly one step of a verified demo.",
    `The authorized target process id is ${pid}${windowId ? ` and its exact window_id is ${windowId}` : ""}. Do not interact with any other process or window.`,
    "Use accessibility-first Computer Use tools bound to both the target pid and window_id when provided.",
    "Use computer_use action=capture with mode=ax to inspect visible text or roles; use capture with mode=som before input actions.",
    "If AX capture is degraded, incomplete, or exposes only the window node, immediately use mode=vision or mode=som on the same pid/window_id and verify the requested text visually from that bounded window capture.",
    "Do not use terminal, browser, network, clipboard-read, kill_app, or launch_app tools.",
    `Execute only step ${stepNumber} of ${totalSteps} in this demo. Do not anticipate or perform any other step.`,
    `Step to execute: ${JSON.stringify(step)}`,
    "For assertVisible, confirm the target from the accessibility tree or, when AX is degraded, from the bounded visual capture. Report passed only after you actually confirmed it.",
    "The host records the video and captures its own screenshot evidence independently. Do not submit forms, communicate externally, delete data, or touch unrelated windows.",
    "Return only JSON: {status, error?}. status is passed or failed.",
  ].join("\n");
}

export async function runDesktopDemoWithReport(
  planInput: HermesDemoPlan,
  desktop: { projectPath: string; launchCommand: string },
  hermes: HermesConfig,
  outputRoot = "output",
  dependencies: {
    runHermes?: HermesRunner;
    launchApp?: AppLauncher;
    resolveWindowId?: (pid: number) => Promise<string | undefined>;
    startRecorder?: RecorderStarter;
    validateVideo?: VideoValidator;
    composeVideo?: VideoComposer;
    videoDuration?: VideoDurationReader;
    captureFrame?: FrameCapturer;
    frameHasVisibleContent?: FrameValidator;
    allowedRoots?: string[];
  } = {},
): Promise<DemoRunResult> {
  const plan = hermesDemoPlanSchema.parse(planInput);
  if (plan.demo.steps.some((step) => step.action === "goto")) throw new Error("Desktop plans cannot contain goto steps");
  const launch = await resolveDesktopLaunch(
    desktop.projectPath,
    desktop.launchCommand,
    dependencies.allowedRoots ?? desktopProjectRoots(),
  );
  const startedAt = new Date();
  const stamp = startedAt.toISOString().replaceAll(":", "-");
  const outputDir = path.resolve(outputRoot, `${plan.demo.name.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}-${stamp}`);
  await mkdir(path.join(outputDir, "evidence"), { recursive: true });
  const reportPath = path.join(outputDir, "execution-report.json");
  const rawVideoPath = path.join(outputDir, "recording-raw.mp4");
  const videoPath = path.join(outputDir, "presentation.mp4");
  const captionsPath = path.join(outputDir, "presentation.vtt");
  const narrationPath = path.join(outputDir, "narration.wav");
  const virtualDisplay = process.platform === "linux" && !dependencies.launchApp ? await startVirtualX11Display() : null;
  const runtimeEnvironment = virtualDisplay?.environment ?? process.env;
  const app = await (dependencies.launchApp ?? defaultAppLauncher)(launch.executable, launch.args, launch.projectPath, runtimeEnvironment);
  let recorder: DesktopRecorder | null = null;
  let recordingStartedAtMs = startedAt.getTime();
  const stepReports: StepExecutionReport[] = [];
  const stepTimings: StepTiming[] = [];
  let executionError: unknown;

  try {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const windowId = dependencies.resolveWindowId
      ? await dependencies.resolveWindowId(app.pid)
      : dependencies.launchApp
        ? undefined
        : await resolveX11WindowId(app.pid, 20_000, runtimeEnvironment);
    if (process.platform === "linux" && !dependencies.launchApp && !windowId) {
      throw new Error(`No X11 window was found for desktop process ${app.pid}`);
    }
    if (windowId) {
      recorder = await (dependencies.startRecorder ?? startGStreamerRecorder)(windowId, rawVideoPath, runtimeEnvironment);
      recordingStartedAtMs = Date.now();
    }

    for (const [index, step] of plan.demo.steps.entries()) {
      const stepStartedAtMs = Date.now();
      const prompt = buildDesktopStepPrompt(step, index + 1, plan.demo.steps.length, app.pid, windowId);
      const args = ["--oneshot", prompt, "--toolsets", "computer_use", "--in", launch.projectPath];
      if (hermes.model) args.push("--model", hermes.model);
      if (hermes.provider) args.push("--provider", hermes.provider);

      let stepStatus: "passed" | "failed" = "failed";
      let stepError: string | undefined;
      try {
        const result = await (dependencies.runHermes ?? defaultHermesRunner)(hermes.command, args, {
          cwd: launch.projectPath,
          timeout: Math.max(hermes.timeoutMs, 60_000),
          env: runtimeEnvironment,
        });
        if (!result.stdout.trim()) throw new Error(result.stderr.trim() || "Hermes returned no result for this step");
        const parsed = stepResultSchema.parse(extractJson(result.stdout));
        if (parsed.status !== "passed") throw new Error(parsed.error || "Hermes reported this step as failed");
        stepStatus = "passed";
      } catch (error) {
        stepError = error instanceof Error ? error.message : String(error);
      }

      // Evidence is captured by the host, not self-reported by the model: a
      // step is only backed by proof if a screenshot the host took itself
      // shows visible content, the same bar the whole recording is held to.
      let evidencePath: string | undefined;
      if (windowId) {
        const relativeEvidencePath = path.join("evidence", `step-${index + 1}-${step.action}.png`);
        try {
          await (dependencies.captureFrame ?? captureWindowFrame)(windowId, path.join(outputDir, relativeEvidencePath), runtimeEnvironment);
          const hasContent = await (dependencies.frameHasVisibleContent ?? verifyWindowFrameHasContent)(path.join(outputDir, relativeEvidencePath));
          if (hasContent) {
            evidencePath = relativeEvidencePath;
          } else if (stepStatus === "passed") {
            stepStatus = "failed";
            stepError = "Host screenshot after this step was black or visually empty";
          }
        } catch (captureError) {
          if (stepStatus === "passed") {
            stepStatus = "failed";
            stepError = captureError instanceof Error ? captureError.message : String(captureError);
          }
        }
      }

      const stepFinishedAtMs = Date.now();
      stepTimings.push({
        index: index + 1,
        interactive: step.action === "click" || step.action === "fill" || step.action === "press",
        startOffsetSec: Math.max(0, (stepStartedAtMs - recordingStartedAtMs) / 1000),
        endOffsetSec: Math.max(0, (stepFinishedAtMs - recordingStartedAtMs) / 1000),
      });
      stepReports.push({
        index: index + 1,
        action: step.action,
        ...(step.title ? { title: step.title } : {}),
        status: stepStatus,
        durationMs: stepFinishedAtMs - stepStartedAtMs,
        ...(evidencePath ? { evidencePath } : {}),
        ...(stepError ? { error: stepError } : {}),
      });

      if (stepStatus !== "passed") throw new Error(stepError ?? "Hermes desktop execution failed");
    }
  } catch (error) {
    executionError = error;
  } finally {
    await recorder?.stop();
    await app.stop();
    await virtualDisplay?.stop();
  }

  if (!executionError) {
    try {
      const video = await stat(rawVideoPath);
      if (video.size === 0) throw new Error("Desktop recorder produced an empty video");
      await (dependencies.validateVideo ?? validateDesktopVideo)(rawVideoPath);
      const recordingDurationSec = await (dependencies.videoDuration ?? desktopVideoDuration)(rawVideoPath);
      const editSegments = buildEditTimeline(stepTimings, recordingDurationSec);
      await (dependencies.composeVideo ?? composeEditedVideo)(rawVideoPath, videoPath, editSegments);
      await (dependencies.validateVideo ?? validateDesktopVideo)(videoPath);
      await writeFile(captionsPath, buildPresentationCaptions(plan.demo.steps, stepReports, editSegments), "utf8");
      const narration = loadNarrationConfig();
      if (narration) {
        await synthesizeNarration(buildNarrationScript(plan.objective, plan.summary), narrationPath, narration);
        const narratedVideoPath = path.join(outputDir, "presentation-narrated.mp4");
        await addNarrationToVideo(videoPath, narrationPath, narratedVideoPath);
        await rm(videoPath, { force: true });
        await copyFile(narratedVideoPath, videoPath);
        await rm(narratedVideoPath, { force: true });
        await (dependencies.validateVideo ?? validateDesktopVideo)(videoPath);
      }
    } catch (error) {
      executionError = error;
    }
  }

  let videoAvailable = false;
  try {
    await stat(videoPath);
    videoAvailable = true;
  } catch {
    // A failed recorder may still provide screenshots and a JSON report.
  }

  const report: DemoExecutionReport = {
    demoName: plan.demo.name,
    status: executionError ? "failed" : "passed",
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    videoPath: videoAvailable ? videoPath : null,
    steps: stepReports.map((stepReport, index) => ({
      ...stepReport,
      ...(stepTimings[index] ? {
        startOffsetSec: stepTimings[index].startOffsetSec,
        endOffsetSec: stepTimings[index].endOffsetSec,
      } : {}),
    })),
    ...(executionError ? { error: executionError instanceof Error ? executionError.message : String(executionError) } : {}),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (executionError) throw new DemoRunError(report.error ?? "Desktop demo failed", { videoPath: videoAvailable ? videoPath : null, reportPath, report }, { cause: executionError });
  return { videoPath, captionsPath, reportPath, report };
}
