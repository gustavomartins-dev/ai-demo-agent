import { chmod, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { buildDesktopExecutionPrompt, desktopFramesHaveVisibleContent, runDesktopDemoWithReport } from "../src/desktop/runner.js";

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
    const prompt = buildDesktopExecutionPrompt(plan, 4321, "/tmp/output", "0xe00004");
    expect(prompt).toContain("process id is 4321");
    expect(prompt).toContain("window_id is 0xe00004");
    expect(prompt).toContain("host records the video independently");
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
    const startRecorder = vi.fn().mockImplementation(async (_windowId: string, videoPath: string) => {
      await writeFile(videoPath, Buffer.alloc(32));
      return { stop: vi.fn().mockResolvedValue(undefined) };
    });
    const runHermes = vi.fn().mockImplementation(async (_command, args: string[]) => {
      return { stdout: JSON.stringify({ status: "passed", steps: [
        { index: 1, status: "passed", durationMs: 20 },
        { index: 2, status: "passed", durationMs: 10 },
      ] }), stderr: "" };
    });

    const result = await runDesktopDemoWithReport(plan, { projectPath: project, launchCommand: "./bin/product" },
      { command: "hermes", timeoutMs: 120_000 }, output, {
        allowedRoots: [root], launchApp, resolveWindowId: async () => "0xe00004", startRecorder, runHermes,
        validateVideo: vi.fn().mockResolvedValue(undefined),
      });

    expect(result.report.status).toBe("passed");
    expect(result.videoPath).toMatch(/recording\.mp4$/);
    expect(runHermes).toHaveBeenCalledOnce();
  });

  it("rejects black frames and accepts frames with visible interface content", () => {
    expect(desktopFramesHaveVisibleContent(Buffer.alloc(64 * 64 * 3))).toBe(false);
    expect(desktopFramesHaveVisibleContent(Buffer.alloc(64 * 64 * 3, 120))).toBe(true);
  });
});
