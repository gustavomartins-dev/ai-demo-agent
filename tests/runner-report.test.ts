import { mkdtemp, readFile, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runDemoWithReport, type DemoExecutionReport } from "../src/runner.js";

describe("Playwright execution evidence", () => {
  it("writes a passed report and screenshot for a visual assertion", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "ai-demo-run-"));
    const result = await runDemoWithReport({
      name: "evidence-test",
      viewport: { width: 640, height: 360 },
      steps: [
        { action: "goto", url: "data:text/html,<h1>Demo ready</h1>" },
        { action: "assertVisible", target: { role: "heading", name: "Demo ready" } }
      ]
    }, outputRoot);

    const report = JSON.parse(await readFile(result.reportPath, "utf8")) as DemoExecutionReport;
    expect(report.status).toBe("passed");
    expect(report.steps[1]?.evidencePath).toBe("evidence/step-2-assert-visible.png");
    await expect(readFile(path.join(path.dirname(result.reportPath), report.steps[1]!.evidencePath!)))
      .resolves.toBeDefined();
  }, 20_000);

  it("writes a failed report before propagating a browser error", async () => {
    const outputRoot = await mkdtemp(path.join(os.tmpdir(), "ai-demo-run-"));

    await expect(runDemoWithReport({
      name: "failure-test",
      viewport: { width: 640, height: 360 },
      steps: [{ action: "goto", url: "http://127.0.0.1:1/unavailable" }]
    }, outputRoot)).rejects.toThrow();

    const [runDirectory] = await readdir(outputRoot);
    const reportPath = path.join(outputRoot, runDirectory!, "execution-report.json");
    const report = JSON.parse(await readFile(reportPath, "utf8")) as DemoExecutionReport;
    expect(report.status).toBe("failed");
    expect(report.steps[0]?.status).toBe("failed");
    expect(report.error).toBeTruthy();
  }, 20_000);
});
