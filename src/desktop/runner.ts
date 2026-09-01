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
    index: z.number().int().positive(),
    status: z.enum(["passed", "failed"]),
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

const defaultHermesRunner: HermesRunner = async (command, args, options) => {
  const ffmpegPath = process.env.AI_DEMO_FFMPEG_PATH;
  const environment = ffmpegPath
    ? { ...process.env, PATH: `${path.dirname(ffmpegPath)}${path.delimiter}${process.env.PATH ?? ""}` }
    : process.env;
  const result = await execFileAsync(command, args, { ...options, env: environment, encoding: "utf8", maxBuffer: 2 * 1024 * 1024 });
  return { stdout: result.stdout, stderr: result.stderr };
};

const defaultAppLauncher: AppLauncher = async (executable, args, cwd) => {
  const child = spawn(executable, args, { cwd, env: process.env, stdio: "ignore" });
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

export function buildDesktopExecutionPrompt(plan: HermesDemoPlan, pid: number, outputDir: string): string {
  return [
    "Operate one already-launched native desktop application and produce verified demo evidence.",
    `The authorized target process id is ${pid}. Do not interact with any other process or window.`,
    `Start Computer Use trajectory recording in ${path.join(outputDir, "trajectory")} with record_video=true.`,
    "Use accessibility-first Computer Use tools bound to the target pid. Do not use terminal, browser, network, clipboard-read, kill_app, or launch_app tools.",
    "Execute the provided semantic steps in order. For assertVisible, call verify_state against the target window and attach the nearest recorded after.png as evidence.",
    "Stop recording even after a failed step. Do not submit forms, communicate externally, delete data, or touch unrelated windows.",
    "Return only JSON: {status, steps:[{index,status,durationMs,evidencePath?,error?}], error?}.",
    "evidencePath must be relative to the output directory, for example trajectory/turn-00002/after.png.",
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
  dependencies: { runHermes?: HermesRunner; launchApp?: AppLauncher; allowedRoots?: string[] } = {},
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
  const videoPath = path.join(outputDir, "trajectory", "recording.mp4");
  const app = await (dependencies.launchApp ?? defaultAppLauncher)(launch.executable, launch.args, launch.projectPath);
  let agentResult: DesktopAgentResult | null = null;
  let executionError: unknown;

  try {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    const args = ["--oneshot", buildDesktopExecutionPrompt(plan, app.pid, outputDir), "--toolsets", "computer_use", "--in", launch.projectPath];
    if (hermes.model) args.push("--model", hermes.model);
    if (hermes.provider) args.push("--provider", hermes.provider);
    const result = await (dependencies.runHermes ?? defaultHermesRunner)(hermes.command, args, {
      cwd: launch.projectPath,
      timeout: Math.max(hermes.timeoutMs, 300_000),
    });
    if (!result.stdout.trim()) throw new Error(result.stderr.trim() || "Hermes returned no desktop execution result");
    agentResult = resultSchema.parse(extractJson(result.stdout));
    if (agentResult.steps.length !== plan.demo.steps.length) throw new Error("Hermes did not report every desktop demo step");
    for (const [index, step] of plan.demo.steps.entries()) {
      const resultStep = agentResult.steps[index];
      if (resultStep?.index !== index + 1) throw new Error("Hermes desktop step indexes are incomplete or out of order");
      if (step.action === "assertVisible" && resultStep.status === "passed") {
        if (!resultStep.evidencePath) throw new Error(`Desktop assertion ${index + 1} has no screenshot evidence`);
        await stat(safeEvidencePath(outputDir, resultStep.evidencePath));
      }
    }
    await stat(videoPath);
    if (agentResult.status !== "passed" || agentResult.steps.some((step) => step.status !== "passed")) {
      throw new Error(agentResult.error || "Hermes desktop execution failed");
    }
  } catch (error) {
    executionError = error;
  } finally {
    await app.stop();
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
      index: step.index,
      action: plan.demo.steps[index]?.action ?? "wait",
      ...(plan.demo.steps[index]?.title ? { title: plan.demo.steps[index].title } : {}),
      status: step.status,
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
