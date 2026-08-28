import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HermesDemoPlan, HermesPlanningRequest } from "./hermes/contract.js";

export type DemoPlanCreator = {
  createDemoPlan(request: HermesPlanningRequest): Promise<HermesDemoPlan>;
};

export type PlanDemoOptions = {
  url: string;
  objective: string;
  repositoryPath?: string;
  outputRoot?: string;
};

async function readRepositoryReadme(repositoryPath: string): Promise<string | undefined> {
  try {
    return await readFile(path.join(repositoryPath, "README.md"), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export async function planDemo(
  options: PlanDemoOptions,
  planner: DemoPlanCreator
): Promise<string> {
  const repositoryPath = path.resolve(options.repositoryPath ?? ".");
  const readme = await readRepositoryReadme(repositoryPath);
  const plan = await planner.createDemoPlan({
    url: options.url,
    objective: options.objective,
    repository: {
      path: repositoryPath,
      ...(readme ? { readme } : {})
    }
  });

  const stamp = new Date().toISOString().replaceAll(":", "-");
  const safeName = plan.demo.name.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
  const outputDir = path.resolve(options.outputRoot ?? "output", `${safeName}-${stamp}`);
  const planPath = path.join(outputDir, "demo-plan.json");

  await mkdir(outputDir, { recursive: true });
  await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");

  return planPath;
}
