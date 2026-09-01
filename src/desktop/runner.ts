import { execFile, spawn } from "node:child_process";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { HermesConfig } from "../hermes/config.js";
import { hermesDemoPlanSchema, type HermesDemoPlan } from "../hermes/contract.js";
import { DemoRunError, type DemoExecutionReport, type DemoRunResult } from "../runner.js";
import { desktopProjectRoots, resolveDesktopLaunch } from "./launch.js";

const execFileAsync = promisify(execFile);

const resultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  steps: z.array(z.object({
    index: z.number().int().nonnegative(),
    status: z.enum(["passed", "failed", "skipped"]),
    durationMs: z.number().int().nonnegative().default(0),
    evidencePath: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
  })),
  error: z.string().min(1).optional(),
});

type DesktopAgentResult = z.infer<typeof resultSchema>;
type HermesRunner = (command: string, args: string[], options: { cwd: string; timeout: number }) => Promise<{ stdout: string; stderr: string }>;
type LaunchedApp = { pid: number; stop(): Promise<void> };
type AppLauncher = (executable: string, args: string[], cwd: string) => Promise<LaunchedApp>;
type DesktopRecorder = { stop(): Promise<void> };
type RecorderStarter = (windowId: string, videoPath: string) => Promise<DesktopRecorder>;

const defaultHermesRunner: HermesRunner = async (command, args, options) => {
  const ffmpegPath = process.env.AI_DEMO_FFMPEG_PATH;
  const environment = ffmpegPath
    ? { ...process.env, PATH: `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH ?? ""}` }
    : process.env;
  const result = await execFileAsync(command, args, { ...options, env: environment, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

const defaultAppLauncher: AppLauncher = async (executable, args, cwd) => {
  const environment = process.platform === "linux"
    ? { ...process.env, GDK_BACKEND: process.env.AI_DEMO_DESKTOP_GDK_BACKEND ?? "x11" }
    : process.env;
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

async function resolveX11WindowId(pid: number, timeoutMs = 10_000): Promise<string | undefined> {
  if (process.platform !== "linux") return undefined;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const root = await execFileAsync("xprop", ["-root", "_NET_CLIENT_LIST"], { encoding: "utf8" });
      const windowIds = root.stdout.match(/0x[0-9a-f]+/gi) ?? [];
      for (const windowId of windowIds) {
        const property = await execFileAsync("xprop", ["-id", windowId, "_NET_WM_PID"], { encoding: "utf8" });
        if (property.stdout.match(/=\s*(\d+)/)?.[1] === String(pid)) return windowId;
      }
    } catch {
      // The window manager may not have registered the new window yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return undefined;
}

const startGStreamerRecorder: RecorderStarter = async (windowId, videoPath) => {
  const info = await execFileAsync("xwininfo", ["-id", windowId], { encoding: "utf8" });
  const read = (label: string) => Number(info.stdout.match(new RegExp(`${label}:\\s*(-?\\d+)`))?.[1]);
  const x = read("Absolute upper-left X");
  const y = read("Absolute upper-left Y");
  const width = read("Width");
  const height = read("Height");
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    throw new Error(`Could not resolve X11 geometry for window ${windowId}`);
  }
  const recorder = spawn("gst-launch-1.0", [
    "-e",
    "ximagesrc", `startx=${x}`, `starty=${y}`, `endx=${x + width - 1}`, `endy=${y + height - 1}`, "use-damage=0", "show-pointer=true",
    "!", "video/x-raw,framerate=30/1",
    "!", "videoconvert",
    "!", "video/x-raw,format=I420",
    "!", "x264enc", "speed-preset=ultrafast", "tune=zerolatency",
    "!", "mp4mux",
    "!", "filesink", `location=${videoPath}`,
  ], { stdio: "ignore" });
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

function extractJson(response: string): unknown {
  const trimmed = response.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed);
}

function safeEvidencePath(outputDir: string, relativePath: string): string {
  if (path.isAbsolute(relativePath)) throw new Error("Desktop evidence path must be relative");
  const resolved = path.resolve(outputDir, relativePath);
  if (!resolved.startsWith(`${outputDir}${path.sep}`)) throw new Error("Desktop evidence escaped its output directory");
  return resolved;
}

export function buildDesktopExecutionPrompt(plan: HermesDemoPlan, pid: number, outputDir: string, windowId?: string): string {
  return [
    "Operate one already-launched native desktop application and produce verified demo evidence.",
    `The authorized target process id is ${pid}${windowId ? ` and its exact window_id is ${windowId}` : ""}. Do not interact with any other process or window.`,
    "Use accessibility-first Computer Use tools bound to both the target pid and window_id when provided.",
    "Use computer_use action=capture with mode=ax to inspect visible text or roles; use capture with mode=som before input actions.",
    "If AX capture is degraded, incomplete, or exposes only the window node, immediately use mode=vision or mode=som on the same pid/window_id and verify the requested text visually from that bounded window capture.",
    "Do not use terminal, browser, network, clipboard-read, kill_app, or launch_app tools.",
    "Execute the provided semantic steps in order. For assertVisible, confirm the target from the accessibility tree or, when AX is degraded, from the bounded visual capture.",
    "The host records the video independently. Do not submit forms, communicate externally, delete data, or touch unrelated windows.",
    "Return only JSON: {status, steps:[{index,status,durationMs,evidencePath?,error?}], error?}.",
    "Use one-based step indexes (the first step is index 1). Step status is passed or failed; use skipped only for later steps not executed after a failure.",
    "Mark a step passed only after the native action or deterministic visibility check succeeds.",
    "Demo plan:",
    JSON.stringify(plan.demo),
  ].join("\n");
}

export async function runDesktopDemoWithReport(
  planInput: HermesDemoPlan,
  desktop: { projectPath: string; launchCommand: string },
  hermes: HermesConfig,
  outputRoot = "output",
  dependencies: { runHermes?: HermesRunner; launchApp?: AppLauncher; resolveWindowId?: (pid: number) => Promise<string | undefined>; startRecorder?: RecorderStarter; allowedRoots?: string[] } = {},
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
  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "execution-report.json");
  const videoPath = path.join(outputDir, "recording.mp4");
  const app = await (dependencies.launchApp ?? defaultAppLauncher)(launch.executable, launch.args, launch.projectPath);
  let recorder: DesktopRecorder | null = null;
  let agentResult: DesktopAgentResult | null = null;
  let executionError: unknown;

  try {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const windowId = dependencies.resolveWindowId
      ? await dependencies.resolveWindowId(app.pid)
      : dependencies.launchApp
        ? undefined
        : await resolveX11WindowId(app.pid);
    if (process.platform === "linux" && !dependencies.launchApp && !windowId) {
      throw new Error(`No X11 window was found for desktop process ${app.pid}`);
    }
    if (windowId) recorder = await (dependencies.startRecorder ?? startGStreamerRecorder)(windowId, videoPath);
    const args = ["--oneshot", buildDesktopExecutionPrompt(plan, app.pid, outputDir, windowId), "--toolsets", "computer_use", "--in", launch.projectPath];
    if (hermes.model) args.push("--model", hermes.model);
    if (hermes.provider) args.push("--provider", hermes.provider);
    const result = await (dependencies.runHermes ?? defaultHermesRunner)(hermes.command, args, {
      cwd: launch.projectPath,
      timeout: Math.max(hermes.timeoutMs, 300_000),
    });
    if (!result.stdout.trim()) throw new Error(result.stderr.trim() || "Hermes returned no desktop execution result");
    agentResult = resultSchema.parse(extractJson(result.stdout));
    if (agentResult.steps.length !== plan.demo.steps.length) throw new Error("Hermes did not report every desktop demo step");
    const indexOffset = agentResult.steps[0]?.index === 0 ? 1 : 0;
    for (const [index, step] of plan.demo.steps.entries()) {
      const resultStep = agentResult.steps[index];
      if (!resultStep) throw new Error("Hermes did not report every desktop demo step");
      if (resultStep?.index + indexOffset !== index + 1) throw new Error("Hermes desktop step indexes are incomplete or out of order");
      if (resultStep.evidencePath) {
        await stat(safeEvidencePath(outputDir, resultStep.evidencePath));
      }
    }
    if (agentResult.status !== "passed" || agentResult.steps.some((step) => step.status !== "passed")) {
      throw new Error(agentResult.error || "Hermes desktop execution failed");
    }
  } catch (error) {
    executionError = error;
  } finally {
    await recorder?.stop();
    await app.stop();
  }

  if (!executionError) {
    try {
      const video = await stat(videoPath);
      if (video.size === 0) throw new Error("Desktop recorder produced an empty video");
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
    steps: (agentResult?.steps ?? []).map((step, index) => ({
      index: index + 1,
      action: plan.demo.steps[index]?.action ?? "wait",
      ...(plan.demo.steps[index]?.title ? { title: plan.demo.steps[index].title } : {}),
      status: step.status === "passed" ? "passed" : "failed",
      durationMs: step.durationMs,
      ...(step.evidencePath ? { evidencePath: step.evidencePath } : {}),
      ...(step.error ? { error: step.error } : {}),
    })),
    ...(executionError ? { error: executionError instanceof Error ? executionError.message : String(executionError) } : {}),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  if (executionError) throw new DemoRunError(report.error ?? "Desktop demo failed", { videoPath: videoAvailable ? videoPath : null, reportPath, report }, { cause: executionError });
  return { videoPath, reportPath, report };
}
