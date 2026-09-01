import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildDesktopExecutionPrompt, runDesktopDemoWithReport } from "../src/desktop/runner.js";

const plan = {
  objective: "Show the native dashboard",
  summary: "Open the plan and verify the hydration dashboard.",
  assumptions: [], warnings: [],
  demo: { name: "native-water", viewport: { width: 1280, height: 720 }, steps: [
    { action: "click" as const, target: { text: "Dashboard" } },
    { action: "assertVisible" as const, target: { text: "Next reminder" } },
  ] },
};

describe("desktop Hermes runner", () => {
  it("binds the prompt to one pid and requires recording", () => {
    const prompt = buildDesktopExecutionPrompt(plan, 4321, "/tmp/output");
    expect(prompt).toContain("process id is 4321");
    expect(prompt).toContain("record_video=true");
    expect(prompt).toContain("Do not interact with any other process");
  });

  it("accepts only a complete video-backed execution report", async () => {
    const root = path.join(os.tmpdir(), `desktop-runner-${crypto.randomUUID()}`);
    const project = path.join(root, "project");
    const output = path.join(root, "output");
    await mkdir(path.join(project, "bin"), { recursive: true });
    const executable = path.join(project, "bin", "product");
    await writeFile(executable, "#!/bin/sh\n", "utf8");
    await chmod(executable, 0o755);
    const launchApp = vi.fn().mockResolvedValue({ pid: 4321, stop: vi.fn().mockResolvedValue(undefined) });
    const runHermes = vi.fn().mockImplementation(async (_command, args: string[]) => {
      const prompt = args[1] ?? "";
      const outputDir = prompt.match(/trajectory recording in (.+?) with record_video=true/)?.[1]?.replace(/\/trajectory$/, "");
      if (!outputDir) throw new Error("Missing output directory in prompt");
      await mkdir(path.join(outputDir, "trajectory", "turn-00002"), { recursive: true });
      await writeFile(path.join(outputDir, "trajectory", "recording.mp4"), Buffer.alloc(32));
      await writeFile(path.join(outputDir, "trajectory", "turn-00002", "after.png"), Buffer.alloc(16));
      return { stdout: JSON.stringify({ status: "passed", steps: [
        { index: 1, status: "passed", durationMs: 20 },
        { index: 2, status: "passed", durationMs: 10, evidencePath: "trajectory/turn-00002/after.png" },
      ] }), stderr: "" };
    });

    const result = await runDesktopDemoWithReport(plan, { projectPath: project, launchCommand: "./bin/product" },
      { command: "hermes", timeoutMs: 120_000 }, output, { allowedRoots: [root], launchApp, runHermes });

    expect(result.report.status).toBe("passed");
    expect(result.videoPath).toMatch(/recording\.mp4$/);
    expect(runHermes).toHaveBeenCalledOnce();
  });
});
