import { readFile } from "node:fs/promises";
import type { Demo } from "./schema.js";
import { hermesDemoPlanSchema, type HermesDemoPlan } from "./hermes/contract.js";

export type DemoExecutor = (demo: Demo, outputRoot?: string) => Promise<string>;

export async function loadDemoPlan(planPath: string): Promise<HermesDemoPlan> {
  const raw = await readFile(planPath, "utf8");
  return hermesDemoPlanSchema.parse(JSON.parse(raw));
}

export function formatDemoPlan(plan: HermesDemoPlan): string {
  const lines = [
    `Objetivo: ${plan.objective}`,
    `Resumo: ${plan.summary}`
  ];

  if (plan.warnings.length > 0) {
    lines.push("", "Alertas:", ...plan.warnings.map((warning) => `- ${warning}`));
  }

  lines.push("", "Passos:");
  for (const [index, step] of plan.demo.steps.entries()) {
    lines.push(`${index + 1}. ${step.title ?? step.action}`);
  }

  return lines.join("\n");
}

export function isExplicitApproval(answer: string): boolean {
  return ["s", "sim"].includes(answer.trim().toLocaleLowerCase("pt-BR"));
}

export async function executeApprovedPlan(
  plan: HermesDemoPlan,
  approved: boolean,
  executor: DemoExecutor,
  outputRoot?: string
): Promise<{ status: "cancelled" } | { status: "completed"; videoPath: string }> {
  const validatedPlan = hermesDemoPlanSchema.parse(plan);
  if (!approved) return { status: "cancelled" };

  const videoPath = await executor(validatedPlan.demo, outputRoot);
  return { status: "completed", videoPath };
}
